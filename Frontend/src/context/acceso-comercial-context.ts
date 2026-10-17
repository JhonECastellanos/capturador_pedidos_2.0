import { createContext, useContext } from "react";
import type { AccesoComercial } from "@abinova/contrato";
export const AccesoComercialContext = createContext<{ acceso?: AccesoComercial; cargando: boolean; error: string; tieneModulo: (id: string) => boolean; reintentar: () => void } | undefined>(undefined);
export function useAccesoComercial() {
  const valor = useContext(AccesoComercialContext);
  if (!valor) throw new Error("useAccesoComercial requiere AccesoComercialProvider");
  return valor;
}
