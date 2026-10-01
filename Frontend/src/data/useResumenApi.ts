import { useQuery } from "@tanstack/react-query";
import type { DashboardResumenDTO, Envelope } from "@ambie/contrato";
import { respuestaRed, usaApi } from "./api";
import { claveConsulta } from "./query";
import { useAuth } from "../context/auth";

export function useResumenApi(desde: string, hasta: string, soloTops = false) {
  const { usuario } = useAuth();
  const ruta = `/dashboard/resumen?desde=${desde}&hasta=${hasta}&soloTops=${soloTops}`;
  const clave = claveConsulta(ruta);
  return useQuery({ queryKey: clave, queryFn: async ({ signal }) => (await respuestaRed<Envelope<DashboardResumenDTO>>(ruta, "GET", undefined, signal)).data, enabled: usaApi && usuario?.rol === "administrador", refetchInterval: 30_000,
    // Mantiene montados gráficos, filtros y scroll mientras cambia el periodo.
    placeholderData: (anterior, consulta) => consulta?.queryKey[1] === clave[1] ? anterior : undefined,
  });
}
