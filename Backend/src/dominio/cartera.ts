import { Tx, numero } from "../common/consecutivos";

/** Suma de aplicaciones activas por pedido (excluye revertidas). */
export async function aplicadoPorPedido(tx: Tx, pedidoIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (pedidoIds.length === 0) return mapa;
  const aplicaciones = await tx.pagoAplicacion.findMany({
    where: { pedidoId: { in: pedidoIds }, revertidoEn: null },
    select: { pedidoId: true, montoAplicado: true },
  });
  for (const a of aplicaciones) {
    mapa.set(a.pedidoId, (mapa.get(a.pedidoId) ?? 0) + numero(a.montoAplicado));
  }
  return mapa;
}

/** Saldo pendiente de un pedido: total menos lo aplicado. */
export function saldoDePedido(total: number, aplicado: number): number {
  return Math.max(0, total - aplicado);
}
