import type { MovimientoCaja } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "caja";

/** El negocio arranca sin datos: los movimientos los genera cada operación. */
export function cargarMovimientosCaja(): MovimientoCaja[] {
  return leer<MovimientoCaja[]>(CLAVE, []);
}

export function guardarMovimientosCaja(movimientos: MovimientoCaja[]): void {
  guardar(CLAVE, movimientos);
}
