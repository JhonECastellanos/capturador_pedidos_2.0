import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus

from vosk import KaldiRecognizer, Model, SetLogLevel
from websockets.asyncio.server import serve
from confianza import confianza_frase

SetLogLevel(-1)
modelo = Model(os.environ.get("VOSK_MODEL_PATH", "/opt/vosk-model-small-es-0.42"))
trabajadores = ThreadPoolExecutor(max_workers=1)
sesiones = 0
limite = int(os.environ.get("VOZ_MAX_SESIONES", "2"))


def procesar(rec, audio):
    if isinstance(audio, str):
        if json.loads(audio).get("reset") == 1:
            rec.Reset()
        return None
    if len(audio) % 2 or len(audio) > 8192:
        raise ValueError("Audio inválido")
    final = rec.AcceptWaveform(audio)
    datos = json.loads(rec.Result() if final else rec.PartialResult())
    if final:
        palabras = datos.get("result", [])
        texto = datos.get("text", "").strip()
        confianza = confianza_frase(texto, palabras)
        return {"tipo": "final", "texto": datos.get("text", ""), "confianza": confianza}
    return {"tipo": "parcial", "texto": datos.get("partial", "")}


async def atender(socket):
    global sesiones
    if sesiones >= limite:
        await socket.close(1013, "Servicio ocupado")
        return
    sesiones += 1
    try:
        rec = KaldiRecognizer(modelo, 16000)
        rec.SetWords(True)
        await socket.send(json.dumps({"tipo": "lista"}))
        anterior = ""
        async for audio in socket:
            resultado = await asyncio.get_running_loop().run_in_executor(trabajadores, procesar, rec, audio)
            if resultado and (resultado["tipo"] == "final" or resultado["texto"] != anterior):
                await socket.send(json.dumps(resultado, ensure_ascii=False))
                anterior = resultado["texto"] if resultado["tipo"] == "parcial" else ""
    except Exception:
        await socket.close(1011, "No se pudo transcribir")
    finally:
        sesiones -= 1


def comprobar_salud(conexion, solicitud):
    if solicitud.path == "/salud":
        return conexion.respond(HTTPStatus.OK, "ok\n")
    return None


async def iniciar():
    async with serve(atender, "0.0.0.0", 2700, process_request=comprobar_salud, max_size=8192, max_queue=8, compression=None, ping_interval=20, ping_timeout=20):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(iniciar())
