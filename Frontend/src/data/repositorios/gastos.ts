import type { Gasto } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "gastos";

export function cargarGastos(): Gasto[] {
  return leer<Gasto[]>(CLAVE, []);
}

export function guardarGastos(gastos: Gasto[]): void {
  guardar(CLAVE, gastos);
}
