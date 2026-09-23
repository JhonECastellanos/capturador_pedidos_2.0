import type { CierreDia } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "cierres";

export function cargarCierres(): CierreDia[] {
  return leer<CierreDia[]>(CLAVE, []);
}

export function guardarCierres(cierres: CierreDia[]): void {
  guardar(CLAVE, cierres);
}
