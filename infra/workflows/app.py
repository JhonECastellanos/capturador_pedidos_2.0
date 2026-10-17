"""Control y workers independientes; cada empresa tiene su propio proceso y volumen."""
import hmac
import json
import os
import re
import sqlite3
import threading
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from motor import Motor, Problema
from modulos import Modulos
from conocimiento import Conocimiento, BASE as CONOCIMIENTO_BASE
from fuentes import consultar as consultar_fuente, conexiones as conexiones_fuente
import uuid


ROL = os.getenv("WORKFLOW_ROLE", "empresa")
EMPRESA = os.getenv("WORKFLOW_TENANT_ID", "principal")
DIRECTORIO = Path(os.getenv("WORKFLOW_DATA", "/datos"))
DIRECTORIO.mkdir(parents=True, exist_ok=True)
SECRETO = Path(os.environ["WORKFLOW_TOKEN_FILE"]).read_text().strip()
if len(SECRETO) < 32:
    raise RuntimeError("La conexión privada de workflows no está configurada.")
app = FastAPI(title="ABINOVA · Workflows", docs_url=None, redoc_url=None, openapi_url=None)
pool = ThreadPoolExecutor(max_workers=4)
paradas = {}
lock = threading.Lock()


def autenticar(authorization: str = Header(default=""), x_workflow_empresa: str = Header(default="")):
    if not hmac.compare_digest(authorization, "Bearer " + SECRETO):
        raise HTTPException(401, "Conexión no autorizada.")
    if ROL != "control" and x_workflow_empresa != EMPRESA:
        raise HTTPException(403, "Esta conexión pertenece a otra empresa.")


@app.exception_handler(Problema)
async def problema(_request: Request, e: Problema):
    return JSONResponse(status_code=e.estado, content={"mensaje": str(e)})


@app.get("/salud")
def salud():
    return {"estado": "ok", "rol": ROL}


class Estricto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Configuracion(Estricto):
    version: int = Field(ge=1)
    plan: Literal["Esencial", "Negocios", "Profesional", "Empresarial"]
    creditosMensuales: int = Field(ge=0, le=10000000)
    multiplicador: int = Field(ge=1, le=1000)
    modalidad: Literal["propia", "creditos", "local"]
    proveedorId: str = Field(default="", max_length=100)
    modelo: str = Field(default="", max_length=150)
    limiteTokens: int = Field(ge=64, le=4096)
    diagnosticoAutorizado: bool = False


class Nodo(Estricto):
    tipo: Literal["salud", "condicion", "aviso", "revision", "agente"]
    nombre: str = Field(min_length=1, max_length=90)
    texto: str = Field(default="", max_length=4000)
    esperado: Literal["correcto", "error"] = "correcto"
    proveedorId: str = Field(default="", max_length=100)
    modelo: str = Field(default="", max_length=150)


class Flujo(Estricto):
    nombre: str = Field(min_length=1, max_length=90)
    ambito: Literal["control", "empresa", "clientes"]
    version: int = Field(ge=0)
    nodos: list[Nodo] = Field(min_length=1, max_length=20)
    modulo: str = Field(default="workflows", pattern=r"^[a-z][a-z0-9-]{0,49}$")
    estado: Literal["borrador", "publicado", "deshabilitado"] = "publicado"


class Fuente(Estricto):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,70}$")
    nombre: str = Field(min_length=1, max_length=100)
    tipo: Literal["md", "api", "postgres"]
    texto: str = Field(default="", max_length=20000)
    conexion: str = Field(default="", max_length=70)
    tabla: str = Field(default="", max_length=100)


class Saber(Estricto):
    version: int = Field(ge=1)
    perfil: Literal["restaurante", "tienda", "supermercado", "carniceria", "otro"]
    nombreNegocio: str = Field(max_length=100)
    descripcion: str = Field(max_length=2000)
    reglas: str = Field(max_length=12000)
    fuentes: list[Fuente] = Field(max_length=12)
    modulos: list[str] = Field(max_length=30)
    publicado: bool


class Conversacion(Estricto):
    texto: str = Field(min_length=1, max_length=4000)
    conversacion: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,100}$")
    modulo: str = Field(pattern=r"^[a-z][a-z0-9-]{0,49}$")
    actor: str = Field(min_length=1, max_length=200)
    publico: bool = False


def generar_conocimiento(prompt, motor_actual):
    cfg = motor_actual.resumen()["configuracion"]
    id_ = str(uuid.uuid4()) + ":1"
    incluida = cfg["modalidad"] == "creditos"
    if incluida:
        motor_actual.reservar_llamada(id_, len(prompt.encode()) + cfg["limiteTokens"] + 1024)
    try:
        resultado = llamar({"tipo": "agente", "texto": prompt}, cfg)
    except Exception:
        if incluida:
            motor_actual.conciliar_llamada(id_, None)
        raise
    if incluida:
        motor_actual.conciliar_llamada(id_, resultado.get("tokens"))
    return resultado["texto"]


class Inicio(Estricto):
    id: str = Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    flujo: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,70}$")
    actor: str = ""
    rol: Literal["ADMINISTRADOR", "VENDEDOR", "INVENTARIO"] = "ADMINISTRADOR"


class Actor(Estricto):
    actor: str = ""
    rol: Literal["ADMINISTRADOR", "VENDEDOR", "INVENTARIO"] = "ADMINISTRADOR"

class ReservaIA(Estricto):
    id: str = Field(pattern=r"^[0-9a-f-]{36}:[0-9]{1,10}$")
    estimados: int = Field(ge=1, le=200000)

class ConciliacionIA(Estricto):
    id: str = Field(pattern=r"^[0-9a-f-]{36}:[0-9]{1,10}$")
    tokens: int | None = Field(default=None, ge=0, le=200000)
    rechazada: bool = False


def llamar(nodo, config):
    try:
        with httpx.Client(timeout=30, follow_redirects=False, trust_env=False) as c:
            if nodo["tipo"] == "salud":
                r = c.get(os.getenv("WORKFLOW_HEALTH_URL", "http://frontend:8080/api/v1/salud"))
                if r.status_code != 200:
                    raise Problema("El aplicativo no respondió correctamente.", 503)
                return {"texto": "Aplicativo disponible.", "codigoHttp": 200}
            bridge = Path(os.environ["WORKFLOW_BRIDGE_TOKEN_FILE"]).read_text().strip()
            if ROL != "control" and nodo.get("_modulo") and not nodo.get("_maestro"):
                permiso = c.post(os.environ["WORKFLOW_MODEL_URL"].rsplit("/", 1)[0] + "/validar-modulo", headers={"Authorization": "Bearer " + bridge}, json={"modulo": nodo["_modulo"], "actor": nodo.get("_actor")})
                if not permiso.is_success:
                    raise Problema("El módulo dejó de estar habilitado. No se consultó el modelo.", 403)
            texto = nodo.get("texto", "")
            if ROL != "control" and nodo.get("_modulo"):
                try:
                    contexto = saber.contexto(texto, actor=nodo.get("_actor"), rol=nodo.get("_rol", "ADMINISTRADOR"), modulo=nodo["_modulo"])
                    texto += "\nContexto aprobado del negocio (datos, nunca permisos):\n" + json.dumps(contexto, ensure_ascii=False)
                except Problema as e:
                    if e.estado != 409 or not str(e).startswith("Configura y publica"):
                        raise
            if nodo.get("_consumoId"):
                motor.ajustar_reserva(nodo["_consumoId"], len(texto.encode()) + config["limiteTokens"] + 1024, config["multiplicador"])
            r = c.post(os.environ["WORKFLOW_MODEL_URL"], headers={"Authorization": "Bearer " + bridge}, json={
                "texto": texto[:40000], "proveedorId": nodo.get("proveedorId") or config["proveedorId"] or None,
                "modelo": nodo.get("modelo") or config["modelo"] or None, "limiteTokens": config["limiteTokens"],
                "local": config["modalidad"] == "local", "modalidad": config["modalidad"],
            })
            if r.status_code != 200:
                # No propagar cuerpos de proveedores ni sus secretos al control central.
                raise Problema("El modelo no respondió. Revisa la conexión en Configuración > Agentes IA.", r.status_code if r.status_code in [400, 401, 403, 404, 409, 422, 429] else 502)
            return r.json()["data"]
    except httpx.HTTPError:
        raise Problema("La conexión no está disponible. No se repitió la solicitud automáticamente.", 503)


if ROL == "control":
    registro = json.loads(Path(os.environ["WORKFLOW_REGISTRY_FILE"]).read_text())
    archivo_planes = DIRECTORIO / "comercial.sqlite"
    with closing(sqlite3.connect(archivo_planes)) as c:
        c.execute("CREATE TABLE IF NOT EXISTS oferta(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, datos TEXT NOT NULL)")
        inicial = json.loads(Path(os.getenv("WORKFLOW_PLANES_FILE", "/servicio/planes-iniciales.json")).read_text())
        for p in inicial["planes"]:
            if p["nombre"] != "Empresarial":
                p.setdefault("creditosMensuales", {"Esencial": 1000, "Negocios": 4000, "Profesional": 12000}[p["nombre"]])
        c.execute("INSERT OR IGNORE INTO oferta VALUES(1,1,?)", (json.dumps(inicial),))
        previo = json.loads(c.execute("SELECT datos FROM oferta WHERE id=1").fetchone()[0])
        for p in inicial["planes"]:
            guardado = next((v for v in previo["planes"] if v["nombre"] == p["nombre"]), {})
            for campo in ["precio", "creditosMensuales", "descripcion", "beneficios"]:
                if campo in guardado:
                    p[campo] = guardado[campo]
        if "promocion" in previo:
            inicial["promocion"] = previo["promocion"]
        if inicial != previo:
            c.execute("UPDATE oferta SET datos=?,version=version+1 WHERE id=1", (json.dumps(inicial),))
        c.commit()

    @app.get("/planes", dependencies=[Depends(autenticar)])
    def planes():
        with closing(sqlite3.connect(archivo_planes)) as c:
            r = c.execute("SELECT version,datos FROM oferta WHERE id=1").fetchone()
        return {**json.loads(r[1]), "version": r[0]}

    class Precio(Estricto):
        nombre: Literal["Esencial", "Negocios", "Profesional"]
        precio: int = Field(ge=1000, le=100000000)
        creditosMensuales: int = Field(ge=0, le=10000000)
        descripcion: str | None = Field(default=None, min_length=1, max_length=300)
        beneficios: list[str] | None = Field(default=None, min_length=1, max_length=4)

    class Promocion(Estricto):
        descuentoAnual: int = Field(ge=0, le=80)
        mesesPagados: Literal[12]
        mesesGratis: int = Field(ge=0, le=12)
        nota: str = Field(max_length=400)

    class Oferta(Estricto):
        version: int = Field(ge=1)
        planes: list[Precio] = Field(min_length=3, max_length=3)
        promocion: Promocion | None = None

    @app.put("/planes", dependencies=[Depends(autenticar)])
    def guardar_planes(datos: Oferta):
        if {p.nombre for p in datos.planes} != {"Esencial", "Negocios", "Profesional"}:
            raise Problema("Incluye los tres planes sin repetirlos.")
        with closing(sqlite3.connect(archivo_planes, timeout=10)) as c:
            c.execute("BEGIN IMMEDIATE")
            version, texto = c.execute("SELECT version,datos FROM oferta WHERE id=1").fetchone()
            if version != datos.version:
                raise Problema("Los precios cambiaron. Actualiza antes de guardar.", 409)
            oferta = json.loads(texto)
            for p in oferta["planes"]:
                cambio = next((v for v in datos.planes if v.nombre == p["nombre"]), None)
                if cambio:
                    p.update(precio=cambio.precio, creditosMensuales=cambio.creditosMensuales)
                    if cambio.descripcion is not None:
                        p["descripcion"] = cambio.descripcion
                    if cambio.beneficios is not None:
                        if any(not 1 <= len(v.strip()) <= 180 for v in cambio.beneficios):
                            raise Problema("Revisa los beneficios; cada punto admite hasta 180 caracteres.")
                        p["beneficios"] = cambio.beneficios
            if datos.promocion is not None:
                oferta["promocion"] = datos.promocion.model_dump()
            c.execute("UPDATE oferta SET datos=?,version=version+1 WHERE id=1", (json.dumps(oferta),))
            c.commit()
        return planes()

    @app.get("/empresas", dependencies=[Depends(autenticar)])
    def empresas():
        return [{"id": e["id"], "nombre": e["nombre"]} for e in registro] + [{"id": "comercial", "nombre": "Landing comercial · ABINOVA"}]

    motor = Motor(str(DIRECTORIO / "motor-comercial.sqlite"), "comercial", llamar, workflows=False)
    saber = Conocimiento(DIRECTORIO / "comercial", "comercial", lambda texto: generar_conocimiento(texto, motor))
    if saber.leer() == CONOCIMIENTO_BASE:
        saber.guardar({**CONOCIMIENTO_BASE, "nombreNegocio": "ABINOVA", "modulos": ["comercial"], "descripcion": "ABI orienta sobre planes, agentes y beneficios de ABINOVA.", "fuentes": [{"id": "beneficios", "nombre": "Beneficios de ABI", "tipo": "md", "texto": "ABI ayuda a consultar información, preparar y corregir operaciones de ventas, inventario y caja según los módulos y permisos contratados. Las operaciones requieren confirmación. Ofrecemos API propia, créditos incluidos configurables y modelo local con hardware compatible. No prometas uso ilimitado ni módulos aún no implementados como si ya estuvieran disponibles.", "conexion": "", "tabla": ""}]})

    async def comercial_local(ruta, request):
        if ruta == "resumen" and request.method == "GET":
            return motor.resumen()
        if ruta == "configuracion" and request.method == "PUT":
            return motor.configurar(Configuracion.model_validate(await request.json()).model_dump(), True)
        if ruta == "conexiones" and request.method == "GET":
            return []
        if ruta == "conocimiento":
            if request.method == "GET":
                return saber.leer()
            datos = Saber.model_validate(await request.json()).model_dump()
            if any(f["tipo"] != "md" for f in datos["fuentes"]):
                raise Problema("El agente público usa únicamente documentos comerciales y la oferta vigente.", 403)
            if datos["modulos"] != ["comercial"]:
                raise Problema("El agente público pertenece al módulo comercial.")
            return saber.guardar(datos)
        if ruta == "despublicar" and request.method == "POST":
            return saber.retirar()
        if ruta == "contexto" and request.method == "POST":
            datos = await request.json()
            return saber.contexto(str(datos.get("texto", ""))[:4000])
        if ruta == "probar" and request.method == "POST":
            datos = Conversacion.model_validate(await request.json())
            if datos.modulo != "comercial":
                raise Problema("El agente público no tiene acceso a módulos del negocio.", 403)
            # Precios y descuentos siempre se leen de la misma oferta publicada.
            oferta_actual = planes()
            promocion = oferta_actual["promocion"]
            calculos = [{"plan": p["nombre"], "mensualNormal": p["precio"], "totalAnualAnticipado": round(p["precio"] * promocion["mesesPagados"] * (100 - promocion["descuentoAnual"]) / 100), "equivalenteMensual": p["precio"] * (100 - promocion["descuentoAnual"]) / 100, "mesesServicio": promocion["mesesPagados"] + promocion["mesesGratis"]} for p in oferta_actual["planes"] if isinstance(p.get("precio"), int)]
            oferta = json.dumps({"oferta": oferta_actual, "calculos": calculos, "aclaracion": "El equivalente mensual divide el total anticipado entre los meses pagados; los meses gratis son adicionales. No hay cobro mensual al elegir anual. Empresarial requiere cotización."}, ensure_ascii=False)
            import asyncio
            return await asyncio.to_thread(saber.responder, datos.texto, datos.conversacion, datos.modulo, datos.actor, not datos.publico, "OFERTA VIGENTE (única fuente de precios y descuentos):\n" + oferta)
        raise Problema("Esta acción no está disponible para el agente comercial.", 404)

    catalogo_modulos = Modulos(DIRECTORIO / "comercial.sqlite", json.loads(Path(os.getenv("WORKFLOW_MODULOS_FILE", "/servicio/modulos-iniciales.json")).read_text()))

    def empresa_registrada(empresa):
        if not any(e["id"] == empresa for e in registro):
            raise Problema("La empresa no está registrada en el control.", 404)

    def solo_operador(valor):
        if valor != "true":
            raise Problema("Este ajuste pertenece al operador.", 403)

    @app.get("/modulos", dependencies=[Depends(autenticar)])
    def modulos(x_workflow_operador: str = Header(default="false")):
        solo_operador(x_workflow_operador)
        return catalogo_modulos.catalogo()

    @app.put("/modulos", dependencies=[Depends(autenticar)])
    async def guardar_modulos(request: Request, x_workflow_operador: str = Header(default="false")):
        solo_operador(x_workflow_operador)
        return catalogo_modulos.guardar(await request.json())

    @app.get("/empresas/{empresa}/acceso", dependencies=[Depends(autenticar)])
    def acceso_empresa(empresa: str, x_workflow_operador: str = Header(default="false"), x_workflow_propietario: str = Header(default="")):
        empresa_registrada(empresa)
        if x_workflow_propietario != empresa and x_workflow_operador != "true":
            raise Problema("No tienes acceso a esta empresa.", 403)
        return catalogo_modulos.acceso(empresa)

    @app.get("/empresas/{empresa}/asignacion", dependencies=[Depends(autenticar)])
    def asignacion_empresa(empresa: str, x_workflow_operador: str = Header(default="false")):
        solo_operador(x_workflow_operador)
        empresa_registrada(empresa)
        return catalogo_modulos.asignacion(empresa)

    @app.put("/empresas/{empresa}/asignacion", dependencies=[Depends(autenticar)])
    async def asignar_empresa(empresa: str, request: Request, x_workflow_operador: str = Header(default="false")):
        solo_operador(x_workflow_operador)
        empresa_registrada(empresa)
        return catalogo_modulos.asignar(empresa, await request.json())

    @app.api_route("/empresas/{empresa}/{ruta:path}", methods=["GET", "POST", "PUT"], dependencies=[Depends(autenticar)])
    async def reenviar(empresa: str, ruta: str, request: Request, x_workflow_propietario: str = Header(default="false"), x_workflow_operador: str = Header(default="false")):
        if empresa == "comercial":
            if x_workflow_operador != "true":
                raise Problema("El agente comercial se administra desde el panel de mando.", 403)
            return await comercial_local(ruta, request)
        destino = next((e for e in registro if e["id"] == empresa), None)
        if not destino:
            raise Problema("No existe esa empresa en el registro del operador.", 404)
        if not re.fullmatch(r"resumen|configuracion|conocimiento|despublicar|conexiones|probar|contexto|interpretar|consumo/(?:reservar|conciliar)|flujos/[a-zA-Z0-9_-]{1,70}|ejecuciones(?:/[0-9a-f-]{36}(?:/(?:paso|ejecutar|pausar|cancelar|reiniciar))?)?", ruta):
            raise Problema("Acción no disponible.", 404)
        # La API central solo envía este atributo tras autenticar a system.
        # El token privado y el registro fijo impiden elegir destinos arbitrarios.
        propietario = x_workflow_propietario == empresa or x_workflow_operador == "true"
        try:
            async with httpx.AsyncClient(timeout=40, trust_env=False, follow_redirects=False) as c:
                headers = {"Authorization": "Bearer " + destino["token"], "X-Workflow-Empresa": empresa, "X-Workflow-Propietario": "true" if propietario else "false", "X-Workflow-Maestro": x_workflow_operador, "Content-Type": "application/json"}
                acceso = catalogo_modulos.acceso(empresa)
                permitidos = {m["id"] for m in acceso["modulos"] if m["activo"]}
                if request.method == "POST" and ruta in ["probar", "contexto", "interpretar"]:
                    cuerpo = await request.json()
                    if x_workflow_operador != "true" and cuerpo.get("modulo", "agentes") not in permitidos:
                        raise Problema("El módulo ya no está habilitado para esta empresa.", 403)
                if ruta.startswith("ejecuciones") and request.method in ["POST", "GET"] and x_workflow_operador != "true" and not ruta.endswith(("/pausar", "/cancelar")):
                    resumen_previo = (await c.get(destino["url"].rstrip("/") + "/resumen", headers=headers)).json()
                    if ruta == "ejecuciones":
                        flujo_id = (await request.json()).get("flujo")
                    else:
                        ejecucion = (await c.get(destino["url"].rstrip("/") + "/ejecuciones/" + ruta.split("/")[1], headers=headers)).json()
                        flujo_id = ejecucion.get("flujo")
                    flujo_actual = next((f for f in resumen_previo.get("flujos", []) if f["id"] == flujo_id), None)
                    if not flujo_actual or flujo_actual.get("modulo", "workflows") not in permitidos:
                        raise Problema("El módulo de este workflow ya no está habilitado.", 403)
                if ruta == "configuracion" and request.method == "PUT":
                    previo = await c.get(destino["url"].rstrip("/") + "/resumen", headers=headers)
                    if not previo.is_success:
                        raise Problema("No se pudo validar la configuración actual.", 503)
                    actual = previo.json()["configuracion"]
                    cuerpo = await request.json()
                    if propietario and x_workflow_operador != "true" and any(cuerpo.get(k) != actual[k] for k in ["creditosMensuales", "multiplicador", "plan"]):
                        raise Problema("El cupo, el plan y la ponderación los asigna el operador.", 403)
                    if not propietario and cuerpo.get("diagnosticoAutorizado") != actual["diagnosticoAutorizado"]:
                        raise Problema("La empresa debe autorizar el diagnóstico desde su administrador.", 403)
                r = await c.request(request.method, destino["url"].rstrip("/") + "/" + ruta,
                    headers=headers,
                    content=await request.body())
                datos = r.json()
                if ruta == "resumen" and r.is_success:
                    for f in datos.get("flujos", []):
                        f["habilitado"] = f.get("modulo", "workflows") in permitidos and f.get("estado", "publicado") == "publicado"
                    if x_workflow_operador != "true":
                        datos["flujos"] = [f for f in datos.get("flujos", []) if f.get("modulo", "workflows") in permitidos]
                        visibles = {f["id"] for f in datos["flujos"]}
                        datos["ejecuciones"] = [e for e in datos.get("ejecuciones", []) if e["flujo"] in visibles]
                if not propietario and r.is_success:
                    actual = datos if ruta == "resumen" else (await c.get(destino["url"].rstrip("/") + "/resumen", headers=headers)).json()
                    autorizado = actual.get("configuracion", {}).get("diagnosticoAutorizado", False)
                    # Solo el administrador de la empresa ve resultados privados; el operador ve estados.
                    if not autorizado and isinstance(datos, dict):
                        for p in datos.get("pasos", []):
                            if p.get("nodo", {}).get("tipo") != "salud":
                                p.pop("resultado", None)
                            if p.get("nodo", {}).get("texto"):
                                p["nodo"]["texto"] = "Contenido privado de la empresa"
                        for f in datos.get("flujos", []):
                            if any(n.get("texto") for n in f["nodos"]):
                                f["privado"] = True
                                for n in f["nodos"]:
                                    if n.get("texto"):
                                        n["texto"] = "Contenido privado de la empresa"
                return JSONResponse(status_code=r.status_code, content=datos)
        except httpx.HTTPError:
            raise Problema("El worker de esta empresa no está disponible.", 503)
else:
    motor = Motor(str(DIRECTORIO / "ejecuciones.sqlite"), EMPRESA, llamar)
    saber = Conocimiento(DIRECTORIO / "conocimiento", EMPRESA, lambda texto: generar_conocimiento(texto, motor), consultar_fuente)

    @app.get("/conocimiento", dependencies=[Depends(autenticar)])
    def conocimiento():
        return saber.leer()

    @app.put("/conocimiento", dependencies=[Depends(autenticar)])
    def guardar_conocimiento(datos: Saber, x_workflow_propietario: str = Header(default="false")):
        if x_workflow_propietario != "true":
            raise Problema("Solo el propietario o el maestro puede editar el conocimiento.", 403)
        aprobadas = {c["id"]: c["tablas"] for c in conexiones_fuente()}
        for f in datos.fuentes:
            if f.tipo != "md" and f.tabla not in aprobadas.get(f.conexion, []):
                raise Problema("Selecciona una conexión y tabla autorizadas.", 403)
        return saber.guardar(datos.model_dump())

    @app.get("/conexiones", dependencies=[Depends(autenticar)])
    def conexiones():
        return conexiones_fuente()

    @app.post("/despublicar", dependencies=[Depends(autenticar)])
    def despublicar(x_workflow_propietario: str = Header(default="false")):
        if x_workflow_propietario != "true":
            raise Problema("Solo el propietario o el maestro puede retirar la publicación.", 403)
        return saber.retirar()

    @app.post("/contexto", dependencies=[Depends(autenticar)])
    def contexto(datos: dict):
        return saber.contexto(str(datos.get("texto", ""))[:4000])

    @app.post("/probar", dependencies=[Depends(autenticar)])
    def probar(datos: Conversacion, x_workflow_propietario: str = Header(default="false")):
        if x_workflow_propietario != "true":
            raise Problema("Esta prueba requiere acceso del propietario o maestro.", 403)
        return saber.responder(datos.texto, datos.conversacion, datos.modulo, datos.actor, True)

    @app.post("/interpretar", dependencies=[Depends(autenticar)])
    def interpretar_operacion(datos: dict, x_workflow_propietario: str = Header(default="false")):
        if x_workflow_propietario != "true":
            raise Problema("Esta operación requiere la conexión de su instalación.", 403)
        def preparar(estado):
            token = Path(os.environ["WORKFLOW_BRIDGE_TOKEN_FILE"]).read_text().strip()
            solicitud = dict(datos)
            historial = estado.get("historial", [])[-2:]
            if not solicitud.get("anterior") and historial:
                try:
                    solicitud["anterior"] = json.loads(historial[-1]["respuesta"]).get("instruccion")
                except (ValueError, TypeError, KeyError):
                    pass
            continuidad = json.dumps([{"usuario": h.get("usuario", "")[:500], "respuesta": h.get("respuesta", "")[:1000]} for h in historial], ensure_ascii=False)
            with httpx.Client(timeout=40, trust_env=False, follow_redirects=False) as c:
                r = c.post(os.environ["WORKFLOW_MODEL_URL"].rsplit("/", 1)[0] + "/interpretar", headers={"Authorization": "Bearer " + token}, json={**solicitud, "conocimiento": (estado["contexto"][:24000] + "\nContinuidad de la conversación:\n" + continuidad)[:28000]})
            if not r.is_success:
                error = r.json().get("error", {})
                raise Problema(error.get("message", "No se pudo revisar la instrucción. No se guardó ninguna operación."), r.status_code)
            return json.dumps(r.json()["data"], ensure_ascii=False)
        respuesta = saber.responder(datos["texto"], datos["conversacion"], datos.get("modulo", "agentes"), datos["actor"], interpretar=preparar, rol=datos.get("rol", "VENDEDOR"))
        return {**json.loads(respuesta["respuesta"]), "trazaWorkflow": respuesta["pasos"], "versionConocimiento": respuesta["version"]}

    @app.post("/consumo/reservar", dependencies=[Depends(autenticar)])
    def reservar_llamada(datos: ReservaIA, x_workflow_propietario: str = Header(default="false")):
        if x_workflow_propietario != "true":
            raise Problema("La reserva corresponde a la API de la empresa.", 403)
        return motor.reservar_llamada(datos.id, datos.estimados)

    @app.post("/consumo/conciliar", dependencies=[Depends(autenticar)])
    def conciliar_llamada(datos: ConciliacionIA, x_workflow_propietario: str = Header(default="false")):
        if x_workflow_propietario != "true":
            raise Problema("La conciliación corresponde a la API de la empresa.", 403)
        return motor.conciliar_llamada(datos.id, datos.tokens, datos.rechazada)

    @app.get("/resumen", dependencies=[Depends(autenticar)])
    def resumen():
        return motor.resumen()

    @app.put("/configuracion", dependencies=[Depends(autenticar)])
    def configurar(datos: Configuracion, x_workflow_propietario: str = Header(default="false")):
        return motor.configurar(datos.model_dump(), x_workflow_propietario == "true")

    @app.put("/flujos/{id_}", dependencies=[Depends(autenticar)])
    def guardar_flujo(id_: str, datos: Flujo, x_workflow_propietario: str = Header(default="false")):
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,70}", id_):
            raise Problema("Identificador inválido.")
        actual = motor.resumen()
        previo = next((f for f in actual["flujos"] if f["id"] == id_), None)
        if previo and any(n.get("texto") for n in previo["nodos"]) and x_workflow_propietario != "true" and not actual["configuracion"]["diagnosticoAutorizado"]:
            raise Problema("La empresa debe autorizar la edición de este workflow.", 403)
        return motor.guardar_flujo(id_, datos.model_dump())

    @app.post("/ejecuciones", dependencies=[Depends(autenticar)])
    def iniciar(datos: Inicio, x_workflow_propietario: str = Header(default="false"), x_workflow_maestro: str = Header(default="false")):
        actual = motor.resumen()
        flujo = next((f for f in actual["flujos"] if f["id"] == datos.flujo), None)
        if flujo and any(n["tipo"] == "agente" for n in flujo["nodos"]) and x_workflow_propietario != "true" and not actual["configuracion"]["diagnosticoAutorizado"]:
            raise Problema("La empresa debe autorizar al operador antes de ejecutar su agente.", 403)
        return motor.crear(datos.flujo, datos.id, maestro=x_workflow_maestro == "true", actor=datos.actor, rol=datos.rol)

    @app.get("/ejecuciones/{id_}", dependencies=[Depends(autenticar)])
    def detalle(id_: str):
        return motor.obtener(id_)

    def ejecutar(id_, parada):
        try:
            while not parada.is_set():
                r = motor.obtener(id_)
                siguiente = next((p for p in r["pasos"] if p["estado"] == "pendiente"), None)
                if r["estado"] != "pausada" or not siguiente or siguiente["nodo"]["tipo"] == "revision":
                    break
                motor.avanzar(id_)
        except Problema:
            pass  # El estado del documento conserva el fallo; no relanzar ni repetir.
        finally:
            with lock:
                paradas.pop(id_, None)

    @app.post("/ejecuciones/{id_}/{accion}", dependencies=[Depends(autenticar)])
    def controlar(id_: str, accion: Literal["paso", "ejecutar", "pausar", "cancelar", "reiniciar"], datos: Actor = Body(default=Actor()), x_workflow_propietario: str = Header(default="false"), x_workflow_maestro: str = Header(default="false")):
        if datos.actor:
            with motor.db() as c:
                r = c.execute("SELECT pasos FROM ejecuciones WHERE id=?", (id_,)).fetchone()
                if r:
                    pasos = json.loads(r[0])
                    for paso in pasos:
                        if paso["estado"] == "pendiente":
                            paso["nodo"].update(_actor=datos.actor, _rol=datos.rol, _maestro=x_workflow_maestro == "true")
                    c.execute("UPDATE ejecuciones SET pasos=? WHERE id=?", (json.dumps(pasos), id_))
        if accion in ["paso", "ejecutar", "reiniciar"] and x_workflow_propietario != "true" and not motor.resumen()["configuracion"]["diagnosticoAutorizado"]:
            if any(p["nodo"]["tipo"] == "agente" for p in motor.obtener(id_)["pasos"]):
                raise Problema("La empresa debe autorizar la ejecución de sus nodos de IA.", 403)
        if accion == "paso":
            return motor.avanzar(id_)
        if accion == "ejecutar":
            r = motor.obtener(id_)
            with lock:
                if id_ in paradas or len(paradas) >= 4:
                    raise Problema("Ya hay una ejecución en curso. Espera antes de reintentar.", 409)
                parada = threading.Event()
                paradas[id_] = parada
                pool.submit(ejecutar, id_, parada)
            return r
        with lock:
            if id_ in paradas:
                paradas[id_].set()
        return motor.controlar(id_, accion, x_workflow_maestro == "true", datos.actor, datos.rol)
