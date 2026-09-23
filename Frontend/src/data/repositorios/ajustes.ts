import type { AjusteInventario } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "ajustes";

export function cargarAjustes(): AjusteInventario[] {
  return leer<AjusteInventario[]>(CLAVE, []);
}

export function guardarAjustes(ajustes: AjusteInventario[]): void {
  guardar(CLAVE, ajustes);
}
