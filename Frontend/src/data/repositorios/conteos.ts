import type { ConteoInventario } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "conteos";

export function cargarConteos(): ConteoInventario[] {
  return leer<ConteoInventario[]>(CLAVE, []);
}

export function guardarConteos(conteos: ConteoInventario[]): void {
  guardar(CLAVE, conteos);
}
