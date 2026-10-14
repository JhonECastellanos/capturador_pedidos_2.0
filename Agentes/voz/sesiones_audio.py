"""Audio por la conexión web, con autorización temporal y turnos completos."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

# Cargar la canalización al arrancar, antes de declarar el servicio disponible.
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.frames.frames import Frame, InputAudioRawFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.turns.user_stop.speech_timeout_user_turn_stop_strategy import SpeechTimeoutUserTurnStopStrategy
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker, PipelineParams
from pipecat.workers.runner import WorkerRunner
from motor_audio import WhisperCompartido as WhisperSTTService
from pipecat.transcriptions.language import Language

from pipecat.frames.frames import TranscriptionFrame, VADUserStartedSpeakingFrame

VOCABULARIO_AUDIO = "arepa arepas queso empanada empanadas yogur yogurt gaseosa Coca-Cola café cafés agua aguas Cristal chocolatina chocolatinas Jet galletas Oreo Doritos cliente ocasional efectivo billetera crédito inventario pedido"

usados = {}
activas = set()


def autorizar(ticket: str):
    if len(ticket) > 1500 or ticket.count(".") != 1:
        raise ValueError("Autorización inválida")
    datos, firma = ticket.split(".")
    token = os.environ.get("VOICE_AGENT_TOKEN", "")
    esperada = base64.urlsafe_b64encode(hmac.new(token.encode(), datos.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    if len(token) < 32 or not hmac.compare_digest(firma, esperada):
        raise ValueError("Autorización inválida")
    contenido = json.loads(base64.urlsafe_b64decode(datos + "=" * (-len(datos) % 4)))
    ahora = time.time()
    if not isinstance(contenido.get("exp"), int) or not ahora < contenido["exp"] <= ahora + 35:
        raise ValueError("Autorización vencida")
    identificador = str(UUID(contenido["id"]))
    for anterior, vence in list(usados.items()):
        if vence < ahora:
            usados.pop(anterior, None)
    if identificador in usados:
        raise ValueError("Autorización ya utilizada")
    if len(activas) >= 2:
        raise ValueError("El audio está ocupado. Puedes continuar con texto")
    if contenido.get("stt") != "whisper" or contenido.get("modelo") not in {"tiny", "base", "small"} or contenido.get("idioma") not in {"es", "en"}:
        raise ValueError("Usa Faster-Whisper en español o inglés para las primeras pruebas")
    usados[identificador] = contenido["exp"]
    contenido["id"] = identificador
    return contenido


async def conversar(socket: WebSocket):
    await socket.accept()
    identificador = None
    runner = None
    tarea = None
    inicio_sesion = time.monotonic()
    causa = "desconexion"
    try:
        datos = autorizar(socket.query_params.get("ticket", ""))
        identificador = datos["id"]
        activas.add(identificador)
        ruta = Path(os.environ.get("HF_HOME", "/data/modelos")) / f"whisper-{datos['modelo']}"
        if not (ruta / "model.bin").is_file():
            raise ValueError("Prepara primero el reconocimiento elegido desde Configuración")
        texto_parcial = ""
        turno_abierto = False

        class Entrada(FrameProcessor):
            def __init__(self, mostrar=False):
                super().__init__()
                self.mostrar = mostrar

            async def process_frame(self, frame: Frame, direction: FrameDirection):
                nonlocal texto_parcial, turno_abierto
                await super().process_frame(frame, direction)
                if self.mostrar and isinstance(frame, VADUserStartedSpeakingFrame):
                    turno_abierto = True
                    await socket.send_json({"tipo": "hablando"})
                if self.mostrar and isinstance(frame, TranscriptionFrame) and frame.text.strip():
                    texto_parcial = (texto_parcial + " " + frame.text.strip()).strip()[:6000]
                    await socket.send_json({"tipo": "texto", "texto": texto_parcial})
                await self.push_frame(frame, direction)

        contexto = LLMContext([])
        usuario = LLMContextAggregatorPair(contexto, user_params=LLMUserAggregatorParams(user_turn_strategies=UserTurnStrategies(stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)]))).user()
        stt = await asyncio.to_thread(WhisperSTTService, device="cpu", compute_type="int8", settings=WhisperSTTService.Settings(model=str(ruta), language=Language(datos["idioma"]), hotwords=VOCABULARIO_AUDIO if datos["idioma"] == "es" else None))

        @usuario.event_handler("on_user_turn_stopped")
        async def turno_completo(_agregador, _estrategia, mensaje):
            nonlocal texto_parcial, turno_abierto
            if mensaje.content and len(mensaje.content) > 6000:
                await socket.send_json({"tipo": "error", "mensaje": "La instrucción es demasiado larga. Divide la operación y vuelve a dictarla"})
            elif mensaje.content:
                await socket.send_json({"tipo": "instruccion", "texto": mensaje.content})
            texto_parcial = ""
            turno_abierto = False
            contexto.set_messages([])

        worker = PipelineWorker(Pipeline([Entrada(), VADProcessor(vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=2.0))), stt, Entrada(mostrar=True), usuario, Entrada()]), idle_timeout_secs=None, enable_rtvi=False, params=PipelineParams(audio_in_sample_rate=16000))
        preparado = asyncio.Event()

        @worker.event_handler("on_pipeline_started")
        async def al_iniciar(_worker, _frame):
            preparado.set()

        runner = WorkerRunner(handle_sigint=False)
        await runner.add_workers(worker)
        tarea = asyncio.create_task(runner.run())
        await asyncio.wait_for(preparado.wait(), timeout=25)
        await socket.send_json({"tipo": "listo"})
        print(json.dumps({"evento": "audio-listo", "milisegundos": round((time.monotonic() - inicio_sesion) * 1000)}), flush=True)
        inicio = time.monotonic()
        while not tarea.done():
            if time.monotonic() - inicio >= 3600 and not texto_parcial and not turno_abierto:
                await socket.send_json({"tipo": "reconectar", "mensaje": "Renovando la conexión de audio"})
                causa = "renovacion"
                break
            audio = await asyncio.wait_for(socket.receive_bytes(), timeout=30)
            if not audio or len(audio) % 2 or len(audio) > 12800:
                raise ValueError("El bloque de audio recibido no tiene un formato válido")
            await worker.queue_frames([InputAudioRawFrame(audio, 16000, 1)])
        if tarea.done() and not tarea.cancelled() and tarea.exception():
            raise tarea.exception()
    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        causa = "sin-audio"
        try:
            await socket.send_json({"tipo": "reconectar", "mensaje": "La captura se interrumpió. Reconectando el audio"})
        except Exception:
            pass
    except Exception as error:
        causa = type(error).__name__
        try:
            await socket.send_json({"tipo": "error", "mensaje": str(error) if isinstance(error, ValueError) else "No se pudo procesar el audio. Puedes continuar con texto"})
        except Exception:
            pass
    finally:
        print(json.dumps({"evento": "audio-cerrado", "causa": causa, "segundos": round(time.monotonic() - inicio_sesion, 1)}), flush=True)
        if runner:
            await runner.cancel()
        if tarea:
            await asyncio.gather(tarea, return_exceptions=True)
        if identificador:
            activas.discard(identificador)
        try:
            await socket.close()
        except Exception:
            pass
