"""Cola privada y persistente de conciliaciones Live; solo contacta la API interna."""
import asyncio
import base64
import json
import os
import tempfile
import time
from pathlib import Path
from uuid import UUID

import aiohttp

API = "http://api:3000/api/v1/agentes/audio/live"
MAX_CIERRES = 2000
bloqueo = asyncio.Lock()
admision = asyncio.Lock()


def carpeta():
    ruta = Path(os.environ.get("HF_HOME", "/data/modelos")) / ".live-cierres"
    ruta.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(ruta, 0o700)
    return ruta


def archivo(ticket):
    datos = ticket.split(".", 1)[0]
    contenido = json.loads(base64.urlsafe_b64decode(datos + "=" * (-len(datos) % 4)))
    return carpeta() / (str(UUID(contenido["id"])) + ".json")


def guardar(ticket, tokens, rechazada, desde):
    destino = archivo(ticket)
    if not destino.exists() and sum(1 for _ in destino.parent.glob("*.json")) >= MAX_CIERRES:
        raise ValueError("El audio Live está ocupado conciliando sesiones anteriores")
    contenido = json.dumps({"ticket": ticket, "tokens": tokens, "rechazada": rechazada, "desde": desde}, separators=(",", ":"))
    descriptor, temporal = tempfile.mkstemp(prefix=".cierre-", dir=destino.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as salida:
            descriptor = None
            salida.write(contenido)
            salida.flush()
            os.fsync(salida.fileno())
        os.replace(temporal, destino)
        # Hacer durable también el cambio de nombre en el volumen Linux.
        if os.name == "posix":
            directorio = os.open(destino.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directorio)
            finally:
                os.close(directorio)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if os.path.exists(temporal):
            os.unlink(temporal)
    return destino


async def abrir_con_respaldo(http, ticket):
    # Serializar admisión hasta persistir el respaldo, antes de abrir el proveedor.
    async with admision:
        if sum(1 for _ in carpeta().glob("*.json")) >= MAX_CIERRES:
            raise ValueError("El audio Live está ocupado conciliando sesiones anteriores")
        # Persistir antes de reservar: si se pierde la respuesta, el cierre se recupera.
        # Todavía no se contactó al proveedor, por lo que corresponde devolución.
        async with bloqueo:
            guardar(ticket, 0, True, time.time() + 120)
        async with http.post(API, json={"ticket": ticket}, allow_redirects=False) as respuesta:
            if respuesta.status not in {200, 201}:
                raise ValueError("No se pudo autorizar la sesión Live. Revisa configuración y saldo")
            return await respuesta.json()


async def marcar_proveedor(ticket):
    # Desde aquí un corte puede tener consumo: no devolverlo por suposición.
    async with bloqueo:
        guardar(ticket, None, False, time.time() + 120)



async def enviar_uno(http, ruta):
    try:
        async with bloqueo:
            if not ruta.exists():
                return
            original = ruta.read_bytes()
            dato = json.loads(original)
            if dato["desde"] > time.time():
                return
        cuerpo = {campo: dato[campo] for campo in ("ticket", "tokens", "rechazada")}
        async with http.post(API + "/cerrar", json=cuerpo, allow_redirects=False, timeout=aiohttp.ClientTimeout(total=4)) as respuesta:
            if respuesta.status not in {200, 201}:
                print("Live: conciliación pendiente", flush=True)
                return
        async with bloqueo:
            # No borrar una medición que haya reemplazado el respaldo durante el envío.
            if ruta.exists() and ruta.read_bytes() == original:
                ruta.unlink()
    except Exception:
        print("Live: conciliación pendiente", flush=True)


async def cerrar_con_respaldo(ticket, tokens, rechazada):
    async with bloqueo:
        ruta = guardar(ticket, tokens, rechazada, time.time())
    async with aiohttp.ClientSession(headers={"Authorization": "Bearer " + os.environ.get("VOICE_AGENT_TOKEN", "")}) as http:
        await enviar_uno(http, ruta)


async def recuperar_cierres():
    async with aiohttp.ClientSession(headers={"Authorization": "Bearer " + os.environ.get("VOICE_AGENT_TOKEN", "")}) as http:
        while True:
            try:
                pendientes = []
                async with bloqueo:
                    for ruta in carpeta().glob("*.json"):
                        try:
                            if json.loads(ruta.read_bytes())["desde"] <= time.time():
                                pendientes.append(ruta)
                        except Exception:
                            print("Live: conciliación requiere revisión", flush=True)
                        if len(pendientes) >= 20:
                            break
                await asyncio.gather(*(enviar_uno(http, ruta) for ruta in pendientes))
            except Exception:
                print("Live: recuperación de conciliaciones pendiente", flush=True)
            await asyncio.sleep(5)
