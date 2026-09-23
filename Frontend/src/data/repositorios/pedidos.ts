import type { Pedido } from "../../types";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "pedidos";

/** El negocio arranca sin datos: los pedidos se crean desde la interfaz. */
export function cargarPedidos(): Pedido[] {
  return leer<Pedido[]>(CLAVE, []);
}

export function guardarPedidos(pedidos: Pedido[]): void {
  guardar(CLAVE, pedidos);
}
