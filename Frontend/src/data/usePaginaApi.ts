import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Envelope, EnvelopeLista } from "@ambie/contrato";
import { respuestaRed, usaApi } from "./api";
import { claveConsulta } from "./query";
import { useAuth } from "../context/auth";

/** Lectura acotada por pantalla; descarta respuestas de filtros anteriores. */
export function usePaginaApi<T>(ruta: string, habilitado = true) {
  const { usuario } = useAuth();
  const clave = claveConsulta(ruta);
  const consulta = useQuery({ queryKey: clave, queryFn: async ({ signal }) => {
    const respuesta = await respuestaRed<EnvelopeLista<T>>(ruta, "GET", undefined, signal);
    const [recurso, parametros] = ruta.split("?");
    const filtro = new URLSearchParams(parametros);
    const tamanio = Number(filtro.get("pageSize")) || respuesta.meta?.porPagina || 20;
    const ultima = Math.max(1, Math.ceil((respuesta.meta?.total ?? 0) / tamanio));
    if (Number(filtro.get("page")) > ultima && !respuesta.data.length) {
      filtro.set("page", String(ultima));
      return respuestaRed<EnvelopeLista<T>>(`${recurso}?${filtro}`, "GET", undefined, signal);
    }
    return respuesta;
  }, enabled: habilitado && usaApi && !!usuario, refetchInterval: 30_000,
    placeholderData: (anterior, previa) => previa?.queryKey[1] === clave[1] && String(previa.queryKey[2]).split("?")[0] === ruta.split("?")[0] ? anterior : undefined,
  });
  useEffect(() => {
    if (habilitado && consulta.error) window.dispatchEvent(new CustomEvent("ambie:error-lectura", {detail:consulta.error.message}));
  }, [habilitado, consulta.error]);
  return { items: consulta.data?.data ?? [], total: consulta.data?.meta?.total ?? 0, meta: consulta.data?.meta as (NonNullable<EnvelopeLista<T>["meta"]> & Record<string, unknown>) | undefined, cargando: habilitado && usaApi && !!usuario && consulta.isPending, actualizando: consulta.isPlaceholderData, error: consulta.error?.message ?? "", actualizar: () => { void consulta.refetch(); } };
}

/** El detalle no depende de que su fila siga en la página visible. */
export function useRegistroApi<T>(ruta: string, habilitado: boolean) {
  const { usuario } = useAuth();
  return useQuery({ queryKey: claveConsulta(ruta), queryFn: ({ signal }) => respuestaRed<Envelope<T>>(ruta, "GET", undefined, signal), select: (respuesta) => respuesta.data, enabled: usaApi && !!usuario && habilitado });
}
