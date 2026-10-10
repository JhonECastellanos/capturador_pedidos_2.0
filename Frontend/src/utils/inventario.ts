import type { ConteoInventarioDTO } from "@ambie/contrato";
import type { ConteoInventario } from "../types";

/** Un cero digitado es distinto de una línea que todavía no se ha contado. */
export function normalizarConteo(conteo: ConteoInventarioDTO): ConteoInventario {
  return { ...conteo, finalizadoEn: conteo.finalizadoEn ?? undefined,
    lineasContadas: conteo.lineas.filter(l => l.stockFisico !== null).map(l => l.productoId),
    lineas: conteo.lineas.map(l => ({ ...l, nombre: l.nombre ?? l.nombreInicial ?? "Producto", stockFisico: l.stockFisico ?? 0, diferencia: l.diferencia ?? 0 })) };
}
