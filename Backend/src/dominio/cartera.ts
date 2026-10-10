import { Tx, numero } from "../common/consecutivos";
import { Prisma } from "@prisma/client";

/** Lecturas de cartera y caja comparten la misma definición de pago activo. */
export const pedidosConSaldoSql = Prisma.sql`WITH saldos AS (
  SELECT p.*, GREATEST(0, p.total - COALESCE(a.aplicado, 0)) AS saldo
  FROM pedidos p LEFT JOIN LATERAL (
    SELECT SUM(pa."montoAplicado") AS aplicado FROM "pagoAplicaciones" pa
    JOIN pagos pago ON pago.id = pa."pagoId"
    WHERE pa."pedidoId" = p.id AND pa."revertidoEn" IS NULL AND pago.estado = 'activo'
  ) a ON true WHERE p.estado <> 'cancelado'
)`;

/** Suma de aplicaciones activas por pedido (excluye revertidas). */
export async function aplicadoPorPedido(tx: Tx, pedidoIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (pedidoIds.length === 0) return mapa;
  const aplicaciones = await tx.pagoAplicacion.groupBy({
    by: ["pedidoId"],
    where: { pedidoId: { in: pedidoIds }, revertidoEn: null, pago: { estado: "ACTIVO" } },
    _sum: { montoAplicado: true },
  });
  for (const a of aplicaciones) {
    mapa.set(a.pedidoId, numero(a._sum.montoAplicado ?? 0));
  }
  return mapa;
}

/** Saldo pendiente de un pedido: total menos lo aplicado. */
export function saldoDePedido(total: number, aplicado: number): number {
  return Math.max(0, total - aplicado);
}
