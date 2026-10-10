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
    try:
        datos = autorizar(socket.query_params.get("ticket", ""))
        identificador = datos["id"]
        activas.add(identificador)
        ruta = Path(os.environ.get("HF_HOME", "/data/modelos")) / f"whisper-{datos['modelo']}"
        if not (ruta / "model.bin").is_file():
            raise ValueError("Prepara primero el reconocimiento elegido desde Configuración")
        from pipecat.audio.vad.silero import SileroVADAnalyzer
        from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
        from pipecat.processors.audio.vad_processor import VADProcessor
        from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
        from pipecat.frames.frames import Frame, InputAudioRawFrame
        from pipecat.processors.aggregators.llm_context import LLMContext
        from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
        from pipecat.turns.user_turn_strategies import UserTurnStrategies
        from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import TurnAnalyzerUserTurnStopStrategy
        from pipecat.pipeline.pipeline import Pipeline
        from pipecat.pipeline.worker import PipelineWorker, PipelineParams
        from pipecat.workers.runner import WorkerRunner
        from pipecat.services.whisper.stt import WhisperSTTService
        from pipecat.transcriptions.language import Language

        class Entrada(FrameProcessor):
            async def process_frame(self, frame: Frame, direction: FrameDirection):
                await super().process_frame(frame, direction)
                await self.push_frame(frame, direction)

        contexto = LLMContext([])
        usuario = LLMContextAggregatorPair(contexto, user_params=LLMUserAggregatorParams(user_turn_strategies=UserTurnStrategies(stop=[TurnAnalyzerUserTurnStopStrategy(turn_analyzer=LocalSmartTurnAnalyzerV3(cpu_count=1))]))).user()
        stt = await asyncio.to_thread(WhisperSTTService, device="cpu", compute_type="int8", settings=WhisperSTTService.Settings(model=str(ruta), language=Language(datos["idioma"])))

        @usuario.event_handler("on_user_turn_stopped")
        async def turno_completo(_agregador, _estrategia, mensaje):
            if mensaje.content and len(mensaje.content) > 6000:
                await socket.send_json({"tipo": "error", "mensaje": "La instrucción es demasiado larga. Divide la operación y vuelve a dictarla"})
            elif mensaje.content:
                await socket.send_json({"tipo": "instruccion", "texto": mensaje.content})
            contexto.set_messages([])

        worker = PipelineWorker(Pipeline([Entrada(), VADProcessor(vad_analyzer=SileroVADAnalyzer()), stt, usuario, Entrada()]), idle_timeout_secs=90, enable_rtvi=False, params=PipelineParams(audio_in_sample_rate=16000))
        preparado = asyncio.Event()

        @worker.event_handler("on_pipeline_started")
        async def al_iniciar(_worker, _frame):
            preparado.set()

        runner = WorkerRunner(handle_sigint=False)
        await runner.add_workers(worker)
        tarea = asyncio.create_task(runner.run())
        await asyncio.wait_for(preparado.wait(), timeout=25)
        await socket.send_json({"tipo": "listo"})
        inicio = time.monotonic()
        bytes_recibidos = 0
        while time.monotonic() - inicio < 180 and not tarea.done():
            audio = await asyncio.wait_for(socket.receive_bytes(), timeout=30)
            bytes_recibidos += len(audio)
            if not audio or len(audio) % 2 or len(audio) > 12800 or bytes_recibidos > 120 * 16000 * 2:
                raise ValueError("Se alcanzó el límite de audio. Detén el micrófono y vuelve a iniciarlo")
            await worker.queue_frames([InputAudioRawFrame(audio, 16000, 1)])
    except WebSocketDisconnect:
        pass
    except Exception as error:
        try:
            await socket.send_json({"tipo": "error", "mensaje": str(error) if isinstance(error, ValueError) else "No se pudo procesar el audio. Puedes continuar con texto"})
        except Exception:
            pass
    finally:
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
