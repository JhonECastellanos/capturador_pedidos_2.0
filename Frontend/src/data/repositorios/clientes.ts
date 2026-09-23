import type { Cliente } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "clientes";

/** El negocio arranca sin datos: los clientes se crean desde la interfaz. */
export function cargarClientes(): Cliente[] {
  return leer<Cliente[]>(CLAVE, []);
}

export function guardarClientes(clientes: Cliente[]): void {
  guardar(CLAVE, clientes);
}
