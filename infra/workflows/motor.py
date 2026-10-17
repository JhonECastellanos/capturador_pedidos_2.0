"""Motor de una empresa. Sin SQL comercial, shell, código arbitrario ni Docker socket."""
import json
import math
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo


class Problema(Exception):
    def __init__(self, mensaje, estado=400):
        super().__init__(mensaje)
        self.estado = estado


def ahora():
    return datetime.now(ZoneInfo("America/Bogota")).isoformat()


def mes():
    return ahora()[:7]


CONFIG = {"version": 1, "plan": "Esencial", "creditosMensuales": 1000, "multiplicador": 1,
          "modalidad": "propia", "proveedorId": "", "modelo": "", "limiteTokens": 512,
          "diagnosticoAutorizado": False}


class Motor:
    def __init__(self, archivo, empresa, llamar, workflows=True):
        self.archivo, self.empresa, self.llamar = archivo, empresa, llamar
        self.workflows = workflows
        self.candado = threading.RLock()
        with self.db() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS configuracion(id INTEGER PRIMARY KEY CHECK(id=1), datos TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS flujos(id TEXT PRIMARY KEY, nombre TEXT NOT NULL, ambito TEXT NOT NULL, version INTEGER NOT NULL, nodos TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS ejecuciones(id TEXT PRIMARY KEY, flujo TEXT NOT NULL, estado TEXT NOT NULL, creado TEXT NOT NULL, pasos TEXT NOT NULL, anterior TEXT);
            CREATE TABLE IF NOT EXISTS consumo(id TEXT PRIMARY KEY, periodo TEXT NOT NULL, reserva INTEGER NOT NULL, cobrado INTEGER NOT NULL, estado TEXT NOT NULL);
            """)
            columnas = {r[1] for r in c.execute("PRAGMA table_info(flujos)")}
            if "modulo" not in columnas:
                c.execute("ALTER TABLE flujos ADD COLUMN modulo TEXT NOT NULL DEFAULT 'workflows'")
            if "estado" not in columnas:
                c.execute("ALTER TABLE flujos ADD COLUMN estado TEXT NOT NULL DEFAULT 'publicado'")
            c.execute("INSERT OR IGNORE INTO configuracion VALUES(1,?)", (json.dumps(CONFIG),))
            if self.workflows:
                for id_, nombre, ambito, nodos in [
                    ("salud", "Revisión del servicio", "control", [{"tipo": "salud", "nombre": "Comprobar conexión"}, {"tipo": "condicion", "nombre": "Validar respuesta", "esperado": "correcto"}, {"tipo": "aviso", "nombre": "Preparar reporte", "texto": "Revisión terminada. Consulta el estado de cada paso."}]),
                    ("asistente", "Asistente de la empresa", "empresa", [{"tipo": "agente", "nombre": "Consultar al modelo", "texto": "Explica en una frase cómo revisar una operación antes de confirmarla."}, {"tipo": "revision", "nombre": "Revisar respuesta"}]),
                    ("clientes", "Orientación a clientes", "clientes", [{"tipo": "agente", "nombre": "Preparar respuesta", "texto": "Da una bienvenida breve y pregunta qué necesita el cliente, sin inventar precios ni existencias."}, {"tipo": "revision", "nombre": "Revisar antes de enviar"}]),
                ]:
                    c.execute("INSERT OR IGNORE INTO flujos(id,nombre,ambito,version,nodos) VALUES(?,?,?,1,?)", (id_, nombre, ambito, json.dumps(nodos)))
                # Un proveedor pudo haber consumido tokens antes del corte: no repetirlo silenciosamente.
                for r in c.execute("SELECT id,pasos FROM ejecuciones WHERE estado IN ('ejecutando','pausada')").fetchall():
                    pasos = json.loads(r["pasos"])
                    if not any(p["estado"] == "ejecutando" for p in pasos):
                        continue
                    for p in pasos:
                        if p["estado"] == "ejecutando":
                            p.update(estado="interrumpido", mensaje="El servicio se reinició. Revisa el consumo antes de crear otra ejecución.")
                    c.execute("UPDATE ejecuciones SET estado='interrumpida',pasos=? WHERE id=?", (json.dumps(pasos), r["id"]))


    @contextmanager
    def db(self):
        with self.candado:
            c = sqlite3.connect(self.archivo, timeout=10)
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA busy_timeout=10000")
            try:
                c.execute("BEGIN IMMEDIATE")
                yield c
                c.commit()
            except Exception:
                c.rollback()
                raise
            finally:
                c.close()

    def configurar(self, datos, propietario=False):
        with self.db() as c:
            actual = json.loads(c.execute("SELECT datos FROM configuracion WHERE id=1").fetchone()[0])
            if datos.get("version") != actual["version"]:
                raise Problema("La configuración cambió. Actualiza y vuelve a guardar.", 409)
            nuevo = {**actual, **datos, "version": actual["version"] + 1}
            if not propietario and nuevo["diagnosticoAutorizado"] != actual["diagnosticoAutorizado"]:
                raise Problema("La autorización de diagnóstico corresponde al administrador de la empresa.", 403)
            c.execute("UPDATE configuracion SET datos=? WHERE id=1", (json.dumps(nuevo),))
        return nuevo

    def resumen(self):
        with self.db() as c:
            config = json.loads(c.execute("SELECT datos FROM configuracion WHERE id=1").fetchone()[0])
            uso = c.execute("SELECT coalesce(sum(CASE WHEN estado='reservado' THEN reserva ELSE cobrado END),0) FROM consumo WHERE periodo=?", (mes(),)).fetchone()[0]
            flujos = [{**dict(r), "nodos": json.loads(r["nodos"])} for r in c.execute("SELECT * FROM flujos ORDER BY nombre")] if self.workflows else []
            ejecuciones = [dict(r) for r in c.execute("SELECT id,flujo,estado,creado,anterior FROM ejecuciones ORDER BY creado DESC LIMIT 30")] if self.workflows else []
        return {"empresa": self.empresa, "configuracion": config, "creditos": {"periodo": mes(), "cupo": config["creditosMensuales"], "consumidosOReservados": uso, "disponibles": max(0, config["creditosMensuales"] - uso)}, "flujos": flujos, "ejecuciones": ejecuciones}

    def reservar_llamada(self, id_, estimados):
        with self.db() as c:
            config = json.loads(c.execute("SELECT datos FROM configuracion WHERE id=1").fetchone()[0])
            previo = c.execute("SELECT id FROM consumo WHERE id=?", ("api:" + id_,)).fetchone()
            if previo:
                raise Problema("Esta solicitud ya tiene una reserva. No se repitió la llamada al modelo.", 409)
            reserva = math.ceil(estimados / 1000) * config["multiplicador"]
            usado = c.execute("SELECT coalesce(sum(CASE WHEN estado='reservado' THEN reserva ELSE cobrado END),0) FROM consumo WHERE periodo=?", (mes(),)).fetchone()[0]
            if usado + reserva > config["creditosMensuales"]:
                raise Problema("No hay créditos de IA suficientes. Usa tu API o solicita más cupo al operador.", 409)
            c.execute("INSERT INTO consumo VALUES(?,?,?,0,'reservado')", ("api:" + id_, mes(), reserva))
        return {"id": id_, "reservados": reserva}

    def conciliar_llamada(self, id_, tokens, rechazada=False):
        with self.db() as c:
            fila = c.execute("SELECT reserva,cobrado,estado FROM consumo WHERE id=?", ("api:" + id_,)).fetchone()
            if not fila:
                raise Problema("No existe la reserva de esta solicitud.", 404)
            if fila["estado"] != "reservado":
                return {"id": id_, "cobrados": fila["cobrado"], "estado": fila["estado"]}
            config = json.loads(c.execute("SELECT datos FROM configuracion WHERE id=1").fetchone()[0])
            cobrado = 0 if rechazada else min(fila["reserva"], math.ceil(tokens / 1000) * config["multiplicador"]) if tokens is not None else fila["reserva"]
            estado = "devuelto" if rechazada else "conciliado" if tokens is not None else "estimado"
            c.execute("UPDATE consumo SET cobrado=?,estado=? WHERE id=?", (cobrado, estado, "api:" + id_))
        return {"id": id_, "cobrados": cobrado, "estado": estado}

    def ajustar_reserva(self, id_, estimados, multiplicador):
        with self.db() as c:
            fila = c.execute("SELECT reserva FROM consumo WHERE id=? AND estado='reservado'", (id_,)).fetchone()
            if not fila:
                raise Problema("La reserva ya no está disponible.", 409)
            cfg = json.loads(c.execute("SELECT datos FROM configuracion WHERE id=1").fetchone()[0])
            usado = c.execute("SELECT coalesce(sum(CASE WHEN estado='reservado' THEN reserva ELSE cobrado END),0) FROM consumo WHERE periodo=? AND id<>?", (mes(), id_)).fetchone()[0]
            reserva = math.ceil(estimados / 1000) * multiplicador
            if usado + reserva > cfg["creditosMensuales"]:
                raise Problema("El contexto requiere más créditos de los disponibles. No se consultó el modelo.", 409)
            c.execute("UPDATE consumo SET reserva=? WHERE id=?", (reserva, id_))

    def guardar_flujo(self, id_, datos):
        with self.db() as c:
            previo = c.execute("SELECT version FROM flujos WHERE id=?", (id_,)).fetchone()
            if previo and previo[0] != datos["version"]:
                raise Problema("El flujo cambió. Actualiza antes de guardar.", 409)
            version = previo[0] + 1 if previo else 1
            c.execute("INSERT INTO flujos(id,nombre,ambito,version,nodos,modulo,estado) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,ambito=excluded.ambito,version=excluded.version,nodos=excluded.nodos,modulo=excluded.modulo,estado=excluded.estado", (id_, datos["nombre"], datos["ambito"], version, json.dumps(datos["nodos"]), datos.get("modulo", "workflows"), datos.get("estado", "publicado")))
        return {"id": id_, "version": version}

    def crear(self, flujo, id_, anterior=None, maestro=False, actor="", rol="ADMINISTRADOR"):
        with self.db() as c:
            existente = c.execute("SELECT flujo FROM ejecuciones WHERE id=?", (id_,)).fetchone()
            if existente:
                if existente[0] != flujo:
                    raise Problema("Ese identificador pertenece a otro flujo.", 409)
            else:
                r = c.execute("SELECT nodos,estado,modulo FROM flujos WHERE id=?", (flujo,)).fetchone()
                if not r:
                    raise Problema("No existe ese flujo.", 404)
                if r["estado"] != "publicado":
                    raise Problema("Publica este workflow antes de ejecutarlo.", 409)
                pasos = [{"nodo": {**n, "_modulo": r["modulo"], "_maestro": maestro, "_actor": actor, "_rol": rol}, "estado": "pendiente"} for n in json.loads(r[0])]
                c.execute("INSERT INTO ejecuciones VALUES(?,?,'pausada',?,?,?)", (id_, flujo, ahora(), json.dumps(pasos), anterior))
        return self.obtener(id_)

    def obtener(self, id_):
        with self.db() as c:
            r = c.execute("SELECT * FROM ejecuciones WHERE id=?", (id_,)).fetchone()
            if not r:
                raise Problema("No existe esa ejecución.", 404)
            return {**dict(r), "pasos": json.loads(r["pasos"])}

    def controlar(self, id_, accion, maestro=False, actor="", rol="ADMINISTRADOR"):
        if accion == "reiniciar":
            previo = self.obtener(id_)
            if previo["estado"] == "ejecutando":
                raise Problema("Espera a que termine el paso actual antes de reiniciar.", 409)
            return self.crear(previo["flujo"], str(uuid.uuid4()), id_, maestro, actor, rol)
        with self.db() as c:
            r = c.execute("SELECT estado FROM ejecuciones WHERE id=?", (id_,)).fetchone()
            if not r:
                raise Problema("No existe esa ejecución.", 404)
            if r[0] in ["completada", "cancelada", "error", "interrumpida"]:
                raise Problema("La ejecución terminó. Crea otra para repetirla.", 409)
            c.execute("UPDATE ejecuciones SET estado=? WHERE id=?", ("cancelada" if accion == "cancelar" else "pausada", id_))
        return self.obtener(id_)

    def avanzar(self, id_):
        with self.db() as c:
            r = c.execute("SELECT * FROM ejecuciones WHERE id=?", (id_,)).fetchone()
            if not r:
                raise Problema("No existe esa ejecución.", 404)
            pasos = json.loads(r["pasos"])
            flujo_actual = c.execute("SELECT estado FROM flujos WHERE id=?", (r["flujo"],)).fetchone()
            if not flujo_actual or flujo_actual["estado"] != "publicado":
                raise Problema("El workflow está deshabilitado o en borrador. No se ejecutó otro paso.", 403)
            if any(p["estado"] == "ejecutando" for p in pasos):
                raise Problema("El paso actual sigue trabajando.", 409)
            if r["estado"] != "pausada":
                raise Problema("Esta ejecución no admite otro paso.", 409)
            indice = next((i for i, p in enumerate(pasos) if p["estado"] == "pendiente"), None)
            if indice is None:
                raise Problema("No quedan pasos pendientes.", 409)
            paso = pasos[indice]
            config = json.loads(c.execute("SELECT datos FROM configuracion WHERE id=1").fetchone()[0])
            consumo_id = f"{id_}:{indice}"
            reserva = 0
            if paso["nodo"]["tipo"] == "agente" and config["modalidad"] == "creditos":
                # Reserva conservadora antes de llamar al modelo. Un crédito base = 1.000 tokens,
                # ponderado por el multiplicador del modelo; se concilia con uso real si existe.
                reserva = math.ceil((len(paso["nodo"].get("texto", "").encode()) + config["limiteTokens"] + 1024) / 1000) * config["multiplicador"]
                usado = c.execute("SELECT coalesce(sum(CASE WHEN estado='reservado' THEN reserva ELSE cobrado END),0) FROM consumo WHERE periodo=?", (mes(),)).fetchone()[0]
                if usado + reserva > config["creditosMensuales"]:
                    raise Problema("No hay créditos suficientes para reservar esta respuesta.", 409)
                c.execute("INSERT INTO consumo VALUES(?,?,?,0,'reservado')", (consumo_id, mes(), reserva))
            paso.update(estado="ejecutando", iniciado=ahora())
            c.execute("UPDATE ejecuciones SET estado='ejecutando',pasos=? WHERE id=?", (json.dumps(pasos), id_))
        fallo = False
        rechazo_confirmado = False
        try:
            n = paso["nodo"]
            if n["tipo"] == "condicion":
                estado_previo = pasos[indice - 1]["estado"] if indice else "correcto"
                resultado = {"texto": "Condición cumplida." if estado_previo == n.get("esperado", "correcto") else "Condición no cumplida; se omiten los siguientes pasos.", "continuar": estado_previo == n.get("esperado", "correcto")}
            elif n["tipo"] in ["aviso", "revision"]:
                resultado = {"texto": n.get("texto", "Revisa el resultado antes de continuar. No se ha enviado ningún mensaje ni operación comercial.")}
            else:
                resultado = self.llamar({**n, "_consumoId": consumo_id if reserva else None}, config)
            paso.update(estado="correcto", resultado=resultado, terminado=ahora())
        except Exception as e:
            fallo = True
            rechazo_confirmado = isinstance(e, Problema) and e.estado in [400, 401, 403, 404, 409, 422, 429]
            paso.update(estado="error", mensaje=str(e) if isinstance(e, Problema) else "No se pudo completar el paso. Revisa la conexión o configuración.", terminado=ahora())
        with self.db() as c:
            actual = c.execute("SELECT estado FROM ejecuciones WHERE id=?", (id_,)).fetchone()[0]
            if paso.get("resultado", {}).get("continuar") is False:
                for p in pasos[indice + 1:]:
                    p.update(estado="omitido")
            pendientes = any(p["estado"] == "pendiente" for p in pasos)
            rama_error = fallo and indice + 1 < len(pasos) and pasos[indice + 1]["nodo"]["tipo"] == "condicion" and pasos[indice + 1]["nodo"].get("esperado") == "error"
            estado = "cancelada" if actual == "cancelada" else "error" if fallo and not rama_error else "pausada" if pendientes else "completada"
            c.execute("UPDATE ejecuciones SET estado=?,pasos=? WHERE id=?", (estado, json.dumps(pasos), id_))
            if reserva:
                reserva = c.execute("SELECT reserva FROM consumo WHERE id=?", (consumo_id,)).fetchone()[0]
                tokens = paso.get("resultado", {}).get("tokens")
                cobro = min(reserva, math.ceil(tokens / 1000) * config["multiplicador"]) if isinstance(tokens, int) and tokens >= 0 else reserva
                c.execute("UPDATE consumo SET cobrado=?,estado=? WHERE id=?", (0 if rechazo_confirmado else cobro, "devuelto" if rechazo_confirmado else "conciliado" if not fallo and tokens is not None else "estimado", consumo_id))
        return self.obtener(id_)
