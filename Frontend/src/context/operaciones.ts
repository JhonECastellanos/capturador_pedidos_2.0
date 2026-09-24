import { useContext } from "react";
import { OperacionesContext, type OperacionesContextValue } from "./operaciones-context";

export function useOperaciones(): OperacionesContextValue {
  const context = useContext(OperacionesContext);
  if (!context) throw new Error("useOperaciones debe usarse dentro de <OperacionesProvider>");
  return context;
}
