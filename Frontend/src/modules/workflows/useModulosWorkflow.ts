import { useQuery } from "@tanstack/react-query";
import type { AccesoComercial } from "@abinova/contrato";
import { respuestaRed } from "../../data/api";
import { claveConsulta } from "../../data/query";
import type { ModuloWorkflow } from "./conocimiento-modelo";

export function useModulosWorkflow(empresa: string, propia: boolean, activo: boolean) {
  const comercial = empresa === "comercial";
  const ruta = propia ? "/licencia" : `/control/empresas/${encodeURIComponent(empresa)}/asignacion`;
  const lectura = useQuery({
    queryKey: claveConsulta(ruta), enabled: activo && !!empresa && !comercial, refetchInterval: 5000,
    queryFn: async ({ signal }) => {
      const respuesta = await respuestaRed<{ data: AccesoComercial | { acceso: AccesoComercial } }>(ruta, "GET", undefined, signal);
      return "acceso" in respuesta.data ? respuesta.data.acceso : respuesta.data;
    },
  });
  const modulos: ModuloWorkflow[] = comercial ? [{ id: "comercial", nombre: "Landing comercial", habilitado: true }] : lectura.data?.modulos.map(m => ({ id: m.id, nombre: m.nombre, habilitado: m.activo && m.implementado })) ?? [];
  return { ...lectura, modulos, isPending: !comercial && lectura.isPending, error: comercial ? null : lectura.error };
}
