import type { Producto } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "productos";

/** El negocio arranca sin datos: el catálogo se crea desde la interfaz. */
export function cargarProductos(): Producto[] {
  return leer<Producto[]>(CLAVE, []);
}

export function guardarProductos(productos: Producto[]): void {
  guardar(CLAVE, productos);
}
