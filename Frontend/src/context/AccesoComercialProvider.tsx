import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccesoComercialEsquema, type AccesoComercial } from "@abinova/contrato";
import { useAuth } from "./auth";
import { respuestaRed, usaApi } from "../data/api";
import { claveConsulta } from "../data/query";
import { AccesoComercialContext } from "./acceso-comercial-context";

export function AccesoComercialProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const limitado = usaApi && !!usuario && !usuario.esSistema;
  const consulta = useQuery({ queryKey: claveConsulta("/licencia"), enabled: limitado, staleTime: 0, refetchInterval: 5000,
    queryFn: async ({ signal }) => AccesoComercialEsquema.parse((await respuestaRed<{ data: AccesoComercial }>("/licencia", "GET", undefined, signal)).data) });
  const tieneModulo = (id: string) => !limitado || !!consulta.data?.modulos.some(m => m.id === id && m.activo);
  return <AccesoComercialContext.Provider value={{ acceso: consulta.data, cargando: limitado && consulta.isPending, error: limitado && !consulta.data ? consulta.error?.message ?? "" : "", tieneModulo, reintentar: () => { void consulta.refetch(); } }}>{children}</AccesoComercialContext.Provider>;
}
