import { useQuery } from "@tanstack/react-query";
import type { DashboardResumenDTO, Envelope } from "@ambie/contrato";
import { respuestaRed, usaApi } from "./api";
import { claveConsulta } from "./query";
import { useAuth } from "../context/auth";

export function useResumenApi(desde: string, hasta: string, soloTops = false) {
  const { usuario } = useAuth();
  const ruta = `/dashboard/resumen?desde=${desde}&hasta=${hasta}&soloTops=${soloTops}`;
  return useQuery({ queryKey: claveConsulta(ruta), queryFn: async ({ signal }) => (await respuestaRed<Envelope<DashboardResumenDTO>>(ruta, "GET", undefined, signal)).data, enabled: usaApi && usuario?.rol === "administrador", refetchInterval: 30_000 });
}
