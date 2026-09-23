import type { RecepcionCompra } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "recepciones";

export function cargarRecepciones(): RecepcionCompra[] {
  return leer<RecepcionCompra[]>(CLAVE, []);
}

export function guardarRecepciones(recepciones: RecepcionCompra[]): void {
  guardar(CLAVE, recepciones);
}
