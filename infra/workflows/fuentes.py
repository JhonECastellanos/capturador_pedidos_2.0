"""Conexiones preaprobadas del servidor. El navegador nunca recibe DSN ni SQL."""
import json
import os
from pathlib import Path
import httpx
from motor import Problema


def registro():
    ruta = os.getenv("WORKFLOW_SOURCES_FILE")
    if not ruta:
        return []
    try:
        datos = json.loads(Path(ruta).read_text())
        return datos if isinstance(datos, list) else []
    except (OSError, ValueError):
        raise Problema("Revisa las conexiones privadas de conocimiento.", 503)


def conexiones():
    return [{"id": "catalogo", "nombre": "Catálogo de esta instalación (API)", "tablas": ["productos"]}] + [{"id": d["id"], "nombre": d["nombre"], "tablas": list(d.get("tablas", {}))} for d in registro()]


def consultar(fuente):
    if fuente["tipo"] == "api":
        if fuente.get("conexion") != "catalogo" or fuente.get("tabla") != "productos":
            raise Problema("Selecciona el catálogo autorizado de esta instalación.")
        token = Path(os.environ["WORKFLOW_BRIDGE_TOKEN_FILE"]).read_text().strip()
        with httpx.Client(timeout=5, trust_env=False, follow_redirects=False) as c:
            r = c.post(os.environ["WORKFLOW_MODEL_URL"].rsplit("/", 1)[0] + "/datos", headers={"Authorization": "Bearer " + token}, json={"recurso": "productos", "actor": fuente.get("_actor")})
        if not r.is_success:
            raise Problema("No se pudo consultar el catálogo autorizado.", 503)
        return r.json()["data"]
    destino = next((d for d in registro() if d.get("id") == fuente.get("conexion")), None)
    tabla = fuente.get("tabla")
    if not destino or tabla not in destino.get("tablas", {}):
        raise Problema("La tabla no está autorizada en esta conexión.", 403)
    token = Path(os.environ["WORKFLOW_BRIDGE_TOKEN_FILE"]).read_text().strip()
    with httpx.Client(timeout=5, trust_env=False, follow_redirects=False) as cliente:
        permiso = cliente.post(os.environ["WORKFLOW_MODEL_URL"].rsplit("/", 1)[0] + "/datos", headers={"Authorization": "Bearer " + token}, json={"recurso": "sql", "actor": fuente.get("_actor")})
    if not permiso.is_success:
        raise Problema("Tu acceso actual no permite consultar esta fuente externa.", 403)
    import psycopg
    from psycopg import sql
    # Las columnas y la conexión se aprueban en un archivo privado del servidor.
    # Usa además una cuenta PostgreSQL con permiso SELECT únicamente.
    columnas = destino["tablas"][tabla]
    if not columnas or len(columnas) > 20:
        raise Problema("Configura las columnas de lectura autorizadas.")
    try:
        with psycopg.connect(destino["dsn"], connect_timeout=4, options="-c default_transaction_read_only=on -c statement_timeout=3000") as c:
            c.read_only = True
            with c.cursor() as cursor:
                celdas = [sql.SQL("left({}::text,512)").format(sql.Identifier(columna)) for columna in columnas]
                consulta = sql.SQL("SELECT {} FROM {}.{} LIMIT 30").format(sql.SQL(",").join(celdas), sql.Identifier(destino.get("schema", "public")), sql.Identifier(tabla))
                cursor.execute(consulta)
                return [dict(zip(columnas, fila)) for fila in cursor.fetchall()]
    except psycopg.Error:
        raise Problema("La conexión de lectura no respondió. Revisa permisos y conectividad.", 503)
