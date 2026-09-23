import type { Producto } from "../../types";
import { semillaProductos } from "../semilla";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "productos";

export function cargarProductos(): Producto[] {
  const guardados = leer<Producto[] | null>(CLAVE, null);
  if (guardados) return guardados;
  const sembrados = semillaProductos();
  guardar(CLAVE, sembrados);
  // Evita colisión de consecutivos con la semilla (PROD-001…): inicia el contador en el máximo existente.
  const maximo = sembrados.reduce((max, p) => {
    const n = Number(p.codigoInterno.split("-")[1] ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  guardar("consecutivo:PROD", maximo);
  return sembrados;
}

export function guardarProductos(productos: Producto[]): void {
  guardar(CLAVE, productos);
}
