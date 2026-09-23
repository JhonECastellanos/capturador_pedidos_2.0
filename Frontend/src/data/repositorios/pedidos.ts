import type { Pedido } from "../../types";
import { semillaPedidos } from "../semilla";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "pedidos";

export function cargarPedidos(): Pedido[] {
  const guardados = leer<Pedido[] | null>(CLAVE, null);
  if (guardados) return guardados;
  const sembrados = semillaPedidos();
  guardar(CLAVE, sembrados);
  // Evita colisión de consecutivos con la semilla (PED-0001…): inicia el contador en el máximo existente.
  const maximo = sembrados.reduce((max, p) => {
    const n = Number(p.numero.split("-")[1] ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  guardar("consecutivo:PED", maximo);
  return sembrados;
}

export function guardarPedidos(pedidos: Pedido[]): void {
  guardar(CLAVE, pedidos);
}
