import type { Envelope, EnvelopeLista } from "@ambie/contrato";
import { consultas, claveConsulta } from "./query";

export const usaApi = import.meta.env.VITE_DATOS_ORIGEN !== "local";
export const baseApi = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "").replace(/\/api$/, "/api/v1");
let renovacion: Promise<boolean> | null = null;

export class ErrorApi extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function enviar(ruta: string, metodo: string, datos?: unknown, signal?: AbortSignal) {
  try {
    return await fetch(`${baseApi}${ruta}`, {
      method: metodo, credentials: "include", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      headers: datos === undefined ? {} : { "Content-Type": "application/json" },
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ErrorApi("No se pudo conectar. Revisa tu conexión e intenta de nuevo.", 0);
  }
}

export async function respuestaRed<T>(ruta: string, metodo = "GET", datos?: unknown, signal?: AbortSignal): Promise<T> {
  let respuesta = await enviar(ruta, metodo, datos, signal);
  if (respuesta.status === 401 && (!ruta.startsWith("/auth/") || ruta === "/auth/me" || ruta === "/auth/logout")) {
    renovacion ??= enviar("/auth/refresh", "POST", {}).then((r) => r.ok).catch(() => false).finally(() => { renovacion = null; });
    if (await renovacion) respuesta = await enviar(ruta, metodo, datos, signal);
    if (respuesta.status === 401) window.dispatchEvent(new Event("ambie:sesion-expirada"));
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorApi(cuerpo?.message ?? "La operación no se pudo completar", respuesta.status);
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
