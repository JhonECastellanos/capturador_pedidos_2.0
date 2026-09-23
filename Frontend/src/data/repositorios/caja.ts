import type { MovimientoCaja } from "../../types";
import { semillaMovimientosCaja } from "../semilla";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "caja";

export function cargarMovimientosCaja(): MovimientoCaja[] {
  const guardados = leer<MovimientoCaja[] | null>(CLAVE, null);
  if (guardados) return guardados;
  const sembrados = semillaMovimientosCaja();
  guardar(CLAVE, sembrados);
  return sembrados;
}

export function guardarMovimientosCaja(movimientos: MovimientoCaja[]): void {
  guardar(CLAVE, movimientos);
}
