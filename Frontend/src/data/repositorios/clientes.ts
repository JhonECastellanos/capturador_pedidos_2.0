import type { Cliente } from "../../types";
import { semillaClientes } from "../semilla";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "clientes";

export function cargarClientes(): Cliente[] {
  const guardados = leer<Cliente[] | null>(CLAVE, null);
  if (guardados) return guardados;
  const sembrados = semillaClientes();
  guardar(CLAVE, sembrados);
  return sembrados;
}

export function guardarClientes(clientes: Cliente[]): void {
  guardar(CLAVE, clientes);
}
