import type { AbonoCredito } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "abonos";

export function cargarAbonos(): AbonoCredito[] {
  return leer<AbonoCredito[]>(CLAVE, []);
}

export function guardarAbonos(abonos: AbonoCredito[]): void {
  guardar(CLAVE, abonos);
}
