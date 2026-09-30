import { useQuery } from "@tanstack/react-query";
import type { EnvelopeLista } from "@ambie/contrato";
import { respuestaRed, usaApi } from "./api";
import { claveConsulta } from "./query";
import { useAuth } from "../context/auth";

/** Lectura acotada por pantalla; descarta respuestas de filtros anteriores. */
export function usePaginaApi<T>(ruta: string) {
  const { usuario } = useAuth();
  const consulta = useQuery({ queryKey: claveConsulta(ruta), queryFn: ({ signal }) => respuestaRed<EnvelopeLista<T>>(ruta, "GET", undefined, signal), enabled: usaApi && !!usuario, refetchInterval: 30_000 });
  return { items: consulta.data?.data ?? [], total: consulta.data?.meta?.total ?? 0, cargando: usaApi && !!usuario && consulta.isPending, error: consulta.error?.message ?? "", actualizar: () => { void consulta.refetch(); } };
}
