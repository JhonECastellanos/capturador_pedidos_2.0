import type { Envelope, EnvelopeLista } from "@ambie/contrato";
import { consultas, claveConsulta } from "./query";
import { claveGuardado, resolverGuardado } from "./guardados";

export const usaApi = import.meta.env.VITE_DATOS_ORIGEN !== "local";
export const baseApi = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "").replace(/\/api$/, "/api/v1");
let renovacion: Promise<boolean> | null = null;
let expiraEn = 0;
let revisionAcceso = 0;
let sesionExpirada = false;

function registrarAcceso(cuerpo: { data?: { expiraEn?: string } } | null, renovado = true) {
  const fecha = Date.parse(cuerpo?.data?.expiraEn ?? "");
  if (Number.isFinite(fecha)) expiraEn = fecha;
  if (renovado) revisionAcceso++;
  sesionExpirada = false;
}

function expirarSesion() {
  if (sesionExpirada) return;
  sesionExpirada = true; expiraEn = 0; revisionAcceso++;
  window.dispatchEvent(new Event("ambie:sesion-expirada"));
}

function renovarAcceso() {
  const revisionInicial = revisionAcceso;
  renovacion ??= enviar("/auth/refresh", "POST", {}).then(async (r) => {
    if (revisionInicial !== revisionAcceso) return !sesionExpirada;
    if (r.ok) { registrarAcceso(await r.json()); return true; }
    if (r.status === 401) expirarSesion();
    return false;
  }).finally(() => { renovacion = null; });
  return renovacion;
}

export class ErrorApi extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function enviar(ruta: string, metodo: string, datos?: unknown, signal?: AbortSignal, clave?: string) {
  try {
    return await fetch(`${baseApi}${ruta}`, {
      method: metodo, credentials: "include", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      headers: { ...(datos === undefined ? {} : { "Content-Type": "application/json" }), ...(clave ? { "Idempotency-Key": clave } : {}) },
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ErrorApi("No se pudo conectar. Revisa tu conexión e intenta de nuevo.", 0);
  }
}

export async function respuestaRed<T>(ruta: string, metodo = "GET", datos?: unknown, signal?: AbortSignal): Promise<T> {
  const sesionInicial = claveConsulta(ruta)[1];
  const protegida = ruta !== "/salud" && (!ruta.startsWith("/auth/") || ruta === "/auth/me" || ruta === "/auth/logout");
  if (protegida && ruta !== "/auth/me" && sesionExpirada) throw new ErrorApi("La sesión terminó. Vuelve a iniciar sesión.", 401);
  // Se renueva antes de leer o guardar, también al volver de una pestaña suspendida.
  if (protegida && expiraEn && Date.now() >= expiraEn - 30_000) {
    if (!await renovarAcceso()) throw new ErrorApi(sesionExpirada ? "La sesión terminó. Vuelve a iniciar sesión." : "No se pudo renovar la sesión. Intenta de nuevo.", sesionExpirada ? 401 : 0);
  }
  signal?.throwIfAborted();
  const revisionInicial = revisionAcceso;
  const guardado = await claveGuardado(ruta, metodo, datos);
  signal?.throwIfAborted();
  if (protegida && ruta !== "/auth/me" && sesionExpirada) throw new ErrorApi("La sesión terminó. Vuelve a iniciar sesión.", 401);
  if (protegida && sesionInicial !== claveConsulta(ruta)[1]) throw new DOMException("La sesión cambió durante la solicitud.", "AbortError");
  let respuesta = await enviar(ruta, metodo, datos, signal, guardado?.clave);
  if (protegida && sesionInicial !== claveConsulta(ruta)[1]) throw new DOMException("La sesión cambió durante la solicitud.", "AbortError");
  if (respuesta.status === 401 && protegida) {
    signal?.throwIfAborted();
    // Una respuesta anterior a la renovación no debe volver a rotar las cookies.
    if (!sesionExpirada && (revisionInicial !== revisionAcceso || await renovarAcceso())) {
      signal?.throwIfAborted();
      respuesta = await enviar(ruta, metodo, datos, signal, guardado?.clave);
      if (respuesta.status === 401) expirarSesion();
    }
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (protegida && respuesta.ok && sesionInicial !== claveConsulta(ruta)[1]) throw new DOMException("La sesión cambió durante la solicitud.", "AbortError");
  if (!respuesta.ok) {
    if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408) resolverGuardado(guardado);
    throw new ErrorApi(cuerpo?.message ?? "La operación no se pudo completar", respuesta.status);
  }
  if (cuerpo === null) throw new ErrorApi("No se pudo confirmar la respuesta del guardado. Reintenta con los mismos datos para comprobarlo.", 0);
  if (ruta === "/auth/login") registrarAcceso(cuerpo);
  if (ruta === "/auth/me" && revisionInicial === revisionAcceso) registrarAcceso(cuerpo, false);
  if (ruta === "/auth/logout") { sesionExpirada = true; expiraEn = 0; revisionAcceso++; }
  resolverGuardado(guardado);
  return cuerpo as T;
}

export async function respuestaApi<T>(ruta: string, metodo = "GET", datos?: unknown): Promise<T> {
  if (metodo === "GET" && !ruta.startsWith("/auth/") && ruta !== "/salud") return consultas.fetchQuery({ queryKey: claveConsulta(ruta), queryFn: ({ signal }) => respuestaRed<T>(ruta, "GET", undefined, signal) });
  const respuesta = await respuestaRed<T>(ruta, metodo, datos);
  if (metodo !== "GET" && !ruta.startsWith("/auth/")) await consultas.invalidateQueries({ queryKey: ["api"] });
  return respuesta;
}

export async function api<T>(ruta: string, metodo = "GET", datos?: unknown): Promise<T> {
  return (await respuestaApi<Envelope<T>>(ruta, metodo, datos)).data;
}

/** Respeta la paginación del servidor: nunca limita el negocio a las primeras 20 filas. */
export async function listaApi<T>(ruta: string): Promise<T[]> {
  const filas: T[] = [];
  for (let pagina = 1; ; pagina++) {
    const respuesta = await respuestaApi<EnvelopeLista<T>>(`${ruta}${ruta.includes("?") ? "&" : "?"}page=${pagina}&pageSize=200`);
    filas.push(...respuesta.data);
    if (!respuesta.meta || filas.length >= respuesta.meta.total || !respuesta.data.length) return filas;
  }
}
