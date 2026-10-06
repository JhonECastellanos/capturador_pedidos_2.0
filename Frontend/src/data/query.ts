import { QueryClient } from "@tanstack/react-query";
import { limpiarGuardados } from "./guardados.ts";
export const consultas = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 300_000, retry: false, refetchOnWindowFocus: true } } });
let sesion = 0;
export function claveConsulta(ruta: string) { return ["api", sesion, ruta] as const; }
/** Memoria temporal, aislada por sesión; nunca localStorage. */
export function limpiarConsultas() { sesion++; limpiarGuardados(); void consultas.cancelQueries(); consultas.clear(); }
