import type { CambioPrecio } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "cambiosPrecio";

export function cargarCambiosPrecio(): CambioPrecio[] {
  return leer<CambioPrecio[]>(CLAVE, []);
}

export function guardarCambiosPrecio(cambios: CambioPrecio[]): void {
  guardar(CLAVE, cambios);
}
