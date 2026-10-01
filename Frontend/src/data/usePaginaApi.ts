import { useQuery } from "@tanstack/react-query";
import type { EnvelopeLista } from "@ambie/contrato";
import { respuestaRed, usaApi } from "./api";
import { claveConsulta } from "./query";
import { useAuth } from "../context/auth";

/** Lectura acotada por pantalla; descarta respuestas de filtros anteriores. */
export function usePaginaApi<T>(ruta: string) {
  const { usuario } = useAuth();
  const clave = claveConsulta(ruta);
  const consulta = useQuery({ queryKey: clave, queryFn: ({ signal }) => respuestaRed<EnvelopeLista<T>>(ruta, "GET", undefined, signal), enabled: usaApi && !!usuario, refetchInterval: 30_000,
    placeholderData: (anterior, previa) => previa?.queryKey[1] === clave[1] && String(previa.queryKey[2]).split("?")[0] === ruta.split("?")[0] ? anterior : undefined,
  });
  return { items: consulta.data?.data ?? [], total: consulta.data?.meta?.total ?? 0, cargando: usaApi && !!usuario && consulta.isPending, actualizando: consulta.isPlaceholderData, error: consulta.error?.message ?? "", actualizar: () => { void consulta.refetch(); } };
}
