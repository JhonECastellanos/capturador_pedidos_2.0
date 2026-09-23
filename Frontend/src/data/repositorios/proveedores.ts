import type { Proveedor } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "proveedores";

export function cargarProveedores(): Proveedor[] {
  return leer<Proveedor[]>(CLAVE, []);
}

export function guardarProveedores(proveedores: Proveedor[]): void {
  guardar(CLAVE, proveedores);
}
