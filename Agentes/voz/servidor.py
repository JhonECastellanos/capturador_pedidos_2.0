"""Reconocimiento privado y optativo. No descarga modelos al iniciar."""
import asyncio
import base64
import binascii
import hmac
import logging
import os
import shutil
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket
from pydantic import BaseModel, ConfigDict, Field
from loguru import logger
from sesiones_audio import VOCABULARIO_AUDIO

logger.remove()  # Pipecat no debe registrar el texto de pedidos ni audio privado.
logging.getLogger("uvicorn.error").addFilter(lambda registro: "ticket=" not in registro.getMessage())


@asynccontextmanager
async def ciclo_vida(_app):
    # Instalar el motor no instala modelos; serve nunca ejecuta ollama pull.
    proceso = await asyncio.create_subprocess_exec("ollama", "serve", stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL) if shutil.which("ollama") else None
    try:
        # Solo archivos ya instalados. Cargar el motor antes de declarar salud.
        from motor_audio import precalentar
        for nombre in ("tiny", "base", "small"):
            ruta = Path(os.environ.get("HF_HOME", "/data/modelos")) / f"whisper-{nombre}"
            if (ruta / "model.bin").is_file():
                await asyncio.to_thread(precalentar, ruta)
                break
        yield
    finally:
        if proceso and proceso.returncode is None:
            proceso.terminate()
            try:
                await asyncio.wait_for(proceso.wait(), timeout=5)
            except asyncio.TimeoutError:
                proceso.kill()
                await proceso.wait()


app = FastAPI(lifespan=ciclo_vida, docs_url=None, redoc_url=None, openapi_url=None)
ocupado = asyncio.Lock()
preparaciones: dict[str, dict] = {}
tareas: set[asyncio.Task] = set()
motor = None
motor_id = None


class Ajustes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stt: str = Field(pattern="^(whisper|moonshine)$")
    modelo: str = Field(min_length=1, max_length=120)
    idioma: str = Field(pattern="^[a-z]{2}(-[A-Z]{2})?$")


class Audio(Ajustes):
    audio: str = Field(min_length=1, max_length=7 * 1024 * 1024)
    formato: str = Field(pattern="^audio/(webm|ogg|mp4|wav|mpeg)$")


@app.websocket("/conversar")
async def conversar(socket: WebSocket):
    from sesiones_audio import conversar as atender
    await atender(socket)


async def autenticar(request: Request):
    token = os.environ.get("VOICE_AGENT_TOKEN", "")
    recibido = request.headers.get("Authorization", "")
    if len(token) < 32 or not hmac.compare_digest(recibido, f"Bearer {token}"):
        raise HTTPException(401, "Conexión privada no autorizada")


def clave(ajustes: Ajustes) -> str:
    if ajustes.stt != "whisper":
        raise HTTPException(409, "Moonshine español requiere comprobar su licencia para uso comercial. Usa Faster-Whisper para las primeras pruebas")
    if ajustes.modelo not in {"tiny", "base", "small"}:
        raise HTTPException(400, "Para la primera prueba elige tiny, base o small")
    return f"whisper:{ajustes.modelo}:{ajustes.idioma}"


def ruta_modelo(ajustes: Ajustes) -> Path:
    return Path(os.environ.get("HF_HOME", "/data/modelos")) / f"whisper-{ajustes.modelo}"


async def preparar(ajustes: Ajustes, identificador: str):
    async with ocupado:
        preparaciones[identificador] = {"estado": "preparando", "mensaje": "Preparando el reconocimiento elegido"}
        try:
            from faster_whisper.utils import download_model
            await asyncio.to_thread(download_model, ajustes.modelo, output_dir=str(ruta_modelo(ajustes)))
            preparaciones[identificador] = {"estado": "listo", "mensaje": "Reconocimiento preparado. No se descargó un modelo de Ollama"}
        except Exception:
            preparaciones[identificador] = {"estado": "error", "mensaje": "No se pudo preparar el reconocimiento. Comprueba la conexión y el espacio disponible"}


@app.get("/salud")
async def salud():
    return {"estado": "disponible", "pipecat": "1.12.0"}


@app.post("/estado", dependencies=[Depends(autenticar)])
async def estado():
    estados = list(preparaciones.values())
    instalados = [nombre for nombre in ("tiny", "base", "small") if (Path(os.environ.get("HF_HOME", "/data/modelos")) / f"whisper-{nombre}" / "model.bin").is_file()]
    if any(p["estado"] == "preparando" for p in estados):
        mensaje = "Preparando el reconocimiento. Vuelve a comprobar su estado en un momento"
    elif any(p["estado"] == "error" for p in estados):
        mensaje = next(p["mensaje"] for p in reversed(estados) if p["estado"] == "error")
    elif instalados:
        mensaje = "Servicio de audio listo. Reconocimiento preparado: " + ", ".join(instalados)
    else:
        mensaje = "Servicio de audio disponible. Prepara el reconocimiento para poder transcribir"
    return {"mensaje": mensaje, "preparaciones": preparaciones, "modelosPreparados": instalados, "ocupado": ocupado.locked()}


@app.post("/preparar", dependencies=[Depends(autenticar)])
async def iniciar_preparacion(ajustes: Ajustes):
    identificador = clave(ajustes)
    if preparaciones.get(identificador, {}).get("estado") in {"preparando", "listo"}:
        return {**preparaciones[identificador], "id": identificador}
    if ocupado.locked():
        raise HTTPException(429, "Espera a que termine la operación de audio actual")
    preparaciones[identificador] = {"estado": "preparando", "mensaje": "La preparación comenzó. Usa Comprobar audio para consultar su avance"}
    tarea = asyncio.create_task(preparar(ajustes, identificador))
    tareas.add(tarea)
    tarea.add_done_callback(tareas.discard)
    return {**preparaciones[identificador], "id": identificador}


async def convertir(datos: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix="abinova-audio-") as carpeta:
        origen = Path(carpeta) / "entrada"
        destino = Path(carpeta) / "salida.pcm"
        origen.write_bytes(datos)
        proceso = await asyncio.create_subprocess_exec(
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(origen), "-vn", "-ac", "1", "-ar", "16000", "-t", "121", "-f", "s16le", str(destino),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(proceso.wait(), timeout=15)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            proceso.kill()
            await proceso.wait()
            raise
        if proceso.returncode or not destino.exists():
            raise HTTPException(400, "El archivo no contiene un audio válido")
        pcm = destino.read_bytes()
        if not pcm or len(pcm) > 120 * 16000 * 2:
            raise HTTPException(400, "Usa un audio de hasta dos minutos")
        return pcm


@app.post("/transcribir", dependencies=[Depends(autenticar)])
async def transcribir(audio: Audio):
    global motor, motor_id
    identificador = clave(audio)
    # La carpeta completa permite reutilizar una descarga explícita tras reiniciar.
    if not (ruta_modelo(audio) / "model.bin").is_file():
        raise HTTPException(409, "Primero prepara el reconocimiento desde Configuración")
    if ocupado.locked():
        raise HTTPException(429, "El reconocimiento está ocupado. Intenta nuevamente en un momento")
    try:
        datos = base64.b64decode(audio.audio, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "El audio recibido tiene un formato inválido")
    if not datos or len(datos) > 5 * 1024 * 1024:
        raise HTTPException(400, "El audio debe pesar como máximo 5 MB")
    inicio = time.monotonic()
    async with ocupado:
        try:
            pcm = await convertir(datos)
            from motor_audio import WhisperCompartido as WhisperSTTService
            from pipecat.transcriptions.language import Language
            from pipecat.frames.frames import TranscriptionFrame, ErrorFrame
            if motor_id != identificador:
                motor = None  # Mantener un solo modelo cargado en CPU.
                motor = await asyncio.to_thread(WhisperSTTService, device="cpu", compute_type="int8", settings=WhisperSTTService.Settings(model=str(ruta_modelo(audio)), language=Language(audio.idioma), hotwords=VOCABULARIO_AUDIO if audio.idioma == "es" else None))
                motor_id = identificador
            textos = []
            async for frame in motor.run_stt(pcm):
                if isinstance(frame, ErrorFrame):
                    raise HTTPException(503, "No se pudo reconocer el audio")
                if isinstance(frame, TranscriptionFrame):
                    textos.append(frame.text)
            texto = " ".join(textos).strip()
            if not texto:
                raise HTTPException(422, "No se reconoció una instrucción. Repite con voz clara o escribe el texto")
            return {"texto": texto, "milisegundos": round((time.monotonic() - inicio) * 1000)}
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "No se pudo procesar el audio. Puedes continuar con texto")
