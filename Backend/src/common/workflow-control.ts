import { readFileSync } from "node:fs";
import { ErrorDominio } from "./errores";

export function secretoWorkflow(ruta: string | undefined) {
  if (ruta) { try { const token = readFileSync(ruta, "utf8").trim(); if (token.length >= 32) return token; } catch { /* No mostrar rutas privadas. */ } }
  throw new ErrorDominio("WORKFLOWS_CONFIGURACION", "Revisa la conexión privada de workflows", 503);
}
export async function pedirControlWorkflow(ruta: string, metodo = "GET", datos?: unknown, propietario?: string, operador = false, timeout = 45000) {
  try {
    const r = await fetch((process.env.WORKFLOW_CONTROL_URL ?? "http://workflow-control:8090") + ruta, {
      method: metodo, headers: { Authorization: `Bearer ${secretoWorkflow(process.env.WORKFLOW_CONTROL_TOKEN_FILE)}`, "Content-Type": "application/json", ...(propietario && { "X-Workflow-Propietario": propietario }), ...(operador && { "X-Workflow-Operador": "true" }) },
      ...(datos !== undefined && { body: JSON.stringify(datos) }), signal: AbortSignal.timeout(timeout), redirect: "error",
    });
    const respuesta: unknown = await r.json();
    if (!r.ok) throw new ErrorDominio("WORKFLOWS_OPERACION", (respuesta as { mensaje?: string }).mensaje ?? (typeof (respuesta as { detail?: unknown }).detail === "string" ? (respuesta as { detail: string }).detail : "Revisa los datos de la configuración"), r.status);
    return respuesta;
  } catch (e) { if (e instanceof ErrorDominio) throw e; throw new ErrorDominio("WORKFLOWS_CONEXION", "El servicio de control no está disponible", 503); }
}
