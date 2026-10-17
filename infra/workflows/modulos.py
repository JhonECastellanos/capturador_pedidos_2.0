"""Catálogo comercial y asignaciones; no contiene documentos de las empresas."""
import json
import re
import sqlite3
from contextlib import closing
from motor import Problema


PLANES = {"Esencial", "Negocios", "Profesional", "Empresarial"}
BASE = {"resumen", "configuracion"}


class Modulos:
    def __init__(self, archivo, inicial):
        self.archivo = str(archivo)
        self.implementados = set(inicial["implementados"]) - {"workflows"}
        with closing(sqlite3.connect(self.archivo)) as c:
            c.execute("CREATE TABLE IF NOT EXISTS catalogo_modulos(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, datos TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS accesos_empresa(id TEXT PRIMARY KEY, version INTEGER NOT NULL, datos TEXT NOT NULL)")
            datos = {"modulos": inicial["modulos"], "planes": inicial["planes"]}
            c.execute("INSERT OR IGNORE INTO catalogo_modulos VALUES(1,1,?)", (json.dumps(datos),))
            c.commit()

    def catalogo(self):
        with closing(sqlite3.connect(self.archivo)) as c:
            version, texto = c.execute("SELECT version,datos FROM catalogo_modulos WHERE id=1").fetchone()
        datos = json.loads(texto)
        return {"version": version, "modulos": [m for m in datos["modulos"] if m["id"] != "workflows"], "planes": {p: [m for m in ids if m != "workflows"] for p, ids in datos["planes"].items()}}

    def guardar(self, datos):
        modulos = datos.get("modulos", [])
        ids = [m.get("id", "") for m in modulos]
        if "workflows" in ids:
            raise Problema("Workflows es exclusivo del operador y no es un módulo comercial.")
        if not 2 <= len(ids) <= 100 or len(set(ids)) != len(ids) or not BASE <= set(ids):
            raise Problema("Usa códigos únicos y conserva Resumen y Configuración.")
        for m in modulos:
            if set(m) != {"id", "nombre"} or not re.fullmatch(r"[a-z][a-z0-9-]{0,49}", m["id"]) or not isinstance(m["nombre"], str) or not 2 <= len(m["nombre"].strip()) <= 70:
                raise Problema("Revisa el código y el nombre del módulo.")
        planes = datos.get("planes", {})
        if set(planes) != PLANES or any(not isinstance(v, list) or len(v) != len(set(v)) or not set(v) <= set(ids) or not BASE <= set(v) for v in planes.values()):
            raise Problema("Revisa los módulos de cada plan y conserva sus accesos básicos.")
        with closing(sqlite3.connect(self.archivo, timeout=10)) as c:
            c.execute("BEGIN IMMEDIATE")
            actual = c.execute("SELECT version FROM catalogo_modulos WHERE id=1").fetchone()[0]
            if datos.get("version") != actual:
                raise Problema("El catálogo cambió. Actualiza antes de guardar.", 409)
            c.execute("UPDATE catalogo_modulos SET version=version+1,datos=? WHERE id=1", (json.dumps({"modulos": modulos, "planes": planes}),))
            c.commit()
        return self.catalogo()

    def asignacion(self, empresa):
        with closing(sqlite3.connect(self.archivo)) as c:
            r = c.execute("SELECT version,datos FROM accesos_empresa WHERE id=?", (empresa,)).fetchone()
        # La actualización no recorta el negocio existente hasta asignarle un plan.
        datos = {"version": r[0], **json.loads(r[1])} if r else {"version": 1, "plan": "Empresarial", "adicionales": [], "excluidos": []}
        return {**datos, "adicionales": [m for m in datos["adicionales"] if m != "workflows"], "excluidos": [m for m in datos["excluidos"] if m != "workflows"]}

    def asignar(self, empresa, datos):
        catalogo = self.catalogo()
        ids = {m["id"] for m in catalogo["modulos"]}
        adicionales, excluidos = datos.get("adicionales", []), datos.get("excluidos", [])
        if datos.get("plan") not in PLANES or not isinstance(adicionales, list) or not isinstance(excluidos, list) or not set(adicionales + excluidos) <= ids or set(adicionales) & set(excluidos) or BASE & set(excluidos):
            raise Problema("Revisa el plan y sus excepciones; conserva los accesos básicos.")
        if len(adicionales) != len(set(adicionales)) or len(excluidos) != len(set(excluidos)):
            raise Problema("No repitas módulos en la asignación.")
        with closing(sqlite3.connect(self.archivo, timeout=10)) as c:
            c.execute("BEGIN IMMEDIATE")
            r = c.execute("SELECT version FROM accesos_empresa WHERE id=?", (empresa,)).fetchone()
            actual = r[0] if r else 1
            if datos.get("version") != actual:
                raise Problema("La asignación cambió. Actualiza antes de guardar.", 409)
            cuerpo = {"plan": datos["plan"], "adicionales": adicionales, "excluidos": excluidos}
            c.execute("INSERT INTO accesos_empresa VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,datos=excluded.datos", (empresa, actual + 1, json.dumps(cuerpo)))
            c.commit()
        return self.asignacion(empresa)

    def acceso(self, empresa):
        # Una sola lectura transaccional evita combinar versiones de dos asignaciones.
        with closing(sqlite3.connect(self.archivo)) as c:
            c.execute("BEGIN")
            version, texto = c.execute("SELECT version,datos FROM catalogo_modulos WHERE id=1").fetchone()
            fila = c.execute("SELECT version,datos FROM accesos_empresa WHERE id=?", (empresa,)).fetchone()
        catalogo = json.loads(texto)
        asignacion = json.loads(fila[1]) if fila else {"plan": "Empresarial", "adicionales": [], "excluidos": []}
        elegidos = (set(catalogo["planes"][asignacion["plan"]]) | set(asignacion["adicionales"])) - set(asignacion["excluidos"])
        return {"revision": f"{version}:{fila[0] if fila else 1}", "plan": asignacion["plan"], "modulos": [{**m, "implementado": m["id"] in self.implementados, "activo": m["id"] in elegidos and m["id"] in self.implementados} for m in catalogo["modulos"] if m["id"] != "workflows"]}
