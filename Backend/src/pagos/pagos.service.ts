import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { numero } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { aplicadoPorPedido } from "../dominio/cartera";
import { EstadoPedido, MetodoPago, TipoMovimientoCaja } from "@prisma/client";

const AbonoSchema = z.object({
  monto: z.number().positive(),
  metodo: z.enum(["efectivo", "billetera"]),
  comentario: z.string().optional(),
});

const PagoDirectoSchema = z.object({
  monto: z.number().positive().optional(),
  metodo: z.enum(["efectivo", "billetera"]),
  comentario: z.string().optional(),
});

@Injectable()
export class PagosService {
  constructor(private readonly prisma: PrismaService) {}

  async abono(clienteId: string, datos: z.infer<typeof AbonoSchema>, usuarioId: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado", 404);

    const metodo = datos.metodo === "efectivo" ? MetodoPago.EFECTIVO : MetodoPago.BILLETERA;

    const abono = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clienteId}))`;

      const pedidos = await tx.pedido.findMany({
        where: { clienteId, estado: { not: EstadoPedido.CANCELADO } },
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      });

      const aplicados = await aplicadoPorPedido(
        tx,
        pedidos.map((p) => p.id),
      );

      const pendientes = pedidos
        .map((p) => ({ pedido: p, saldo: Math.max(0, numero(p.total) - (aplicados.get(p.id) ?? 0)) }))
        .filter((x) => x.saldo > 0);

      const cartera = pendientes.reduce((s, x) => s + x.saldo, 0);
      if (datos.monto > cartera) {
        throw new ErrorDominio("PAGO_EXCEDE_CARTERA", `El abono supera la cartera (${cartera})`, 409);
      }

      let restante = datos.monto;
      const parciales: Array<{ pedidoId: string; numero: string; montoAplicado: number }> = [];

      for (const { pedido, saldo } of pendientes) {
        if (restante <= 0) break;
        const aplicado = Math.min(saldo, restante);
        restante -= aplicado;
        parciales.push({ pedidoId: pedido.id, numero: pedido.numero, montoAplicado: aplicado });
      }

      if (parciales.length === 0) {
        throw new ErrorDominio("SIN_CARTERA", "El cliente no tiene deuda pendiente");
      }

      const pago = await tx.pago.create({
        data: {
          clienteId,
          tipo: "ABONO",
          metodo,
          monto: datos.monto,
          usuarioId,
          comentario: datos.comentario?.trim() || undefined,
          fechaOperacion: hoyLocal(),
        },
      });

      for (let i = 0; i < parciales.length; i += 1) {
        await tx.pagoAplicacion.create({
          data: {
            pagoId: pago.id,
            pedidoId: parciales[i].pedidoId,
            montoAplicado: parciales[i].montoAplicado,
            orden: i,
          },
        });
      }

      await tx.movimientoCaja.create({
        data: {
          tipo: TipoMovimientoCaja.INGRESO,
          concepto: `Abono crédito ${cliente.nombre}`,
          monto: datos.monto,
          metodo,
          usuarioId,
          pagoId: pago.id,
          fechaContable: hoyLocal(),
        },
      });

      return { pago, parciales };
    });

    return {
      id: abono.pago.id,
      clienteId,
      monto: numero(abono.pago.monto),
      metodo: datos.metodo,
      usuarioId,
      pedidosAfectados: abono.parciales,
      comentario: abono.pago.comentario,
      creadoEn: abono.pago.creadoEn,
    };
  }

  async pagoDirecto(pedidoId: string, datos: z.infer<typeof PagoDirectoSchema>, usuarioId: string) {
    const metodo = datos.metodo === "efectivo" ? MetodoPago.EFECTIVO : MetodoPago.BILLETERA;

    const resultado = await this.prisma.$transaction(async (tx) => {
      const referencia = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { clienteId: true } });
      if (!referencia) throw new ErrorDominio("NO_ENCONTRADO", "Pedido no encontrado", 404);
      // Mismo candado que FIFO y cancelación: ningún cobro puede usar un saldo obsoleto.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${referencia.clienteId ?? pedidoId}))`;
      await tx.$queryRaw`SELECT id FROM pedidos WHERE id = ${pedidoId} FOR UPDATE`;

      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
      if (!pedido) throw new ErrorDominio("NO_ENCONTRADO", "Pedido no encontrado", 404);
      if (pedido.estado === EstadoPedido.CANCELADO) throw new ErrorDominio("PEDIDO_CANCELADO", "No se puede cobrar un pedido cancelado");

      const aplicados = await aplicadoPorPedido(tx, [pedidoId]);
      const saldo = Math.max(0, numero(pedido.total) - (aplicados.get(pedidoId) ?? 0));
      if (saldo <= 0) throw new ErrorDominio("SIN_SALDO", "El pedido ya está pagado");

      const monto = datos.monto ?? saldo;
      if (monto > saldo) throw new ErrorDominio("MONTO_EXCEDE_SALDO", `El monto supera el saldo del pedido (${saldo})`, 409);

      const pago = await tx.pago.create({
        data: {
          clienteId: pedido.clienteId,
          tipo: "ABONO",
          metodo,
          monto,
          usuarioId,
          comentario: datos.comentario?.trim() || `Cobro al entregar ${pedido.numero}`,
          fechaOperacion: hoyLocal(),
        },
      });
      await tx.pagoAplicacion.create({
        data: { pagoId: pago.id, pedidoId, montoAplicado: monto, orden: 0 },
      });
      await tx.movimientoCaja.create({
        data: {
          tipo: TipoMovimientoCaja.INGRESO,
          concepto: `Pago ${pedido.numero}`,
          monto,
          metodo,
          usuarioId,
          pagoId: pago.id,
          fechaContable: hoyLocal(),
        },
      });

      return { pago, monto, pedido };
    });

    return {
      id: resultado.pago.id,
      clienteId: resultado.pedido.clienteId,
      monto: resultado.monto,
      metodo: datos.metodo,
      usuarioId,
      pedidosAfectados: [
        { pedidoId, numero: resultado.pedido.numero, montoAplicado: resultado.monto },
      ],
      comentario: resultado.pago.comentario,
      creadoEn: resultado.pago.creadoEn,
    };
  }

  async historial(clienteId?: string, pagina = 1, porPagina = 20) {
    const where = clienteId ? { clienteId, tipo: "ABONO" as const } : { tipo: "ABONO" as const };
    const [total, pagos] = await this.prisma.$transaction([
      this.prisma.pago.count({ where }),
      this.prisma.pago.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { aplicaciones: true, cliente: true, usuario: true },
      }),
    ]);

    return {
      data: pagos.map((pago) => ({
        id: pago.id,
        clienteId: pago.clienteId,
        cliente: pago.cliente?.nombre ?? "Venta ocasional",
        monto: numero(pago.monto),
        metodo: pago.metodo.toLowerCase(),
        usuarioId: pago.usuarioId,
        usuario: pago.usuario.nombre,
        comentario: pago.comentario,
        creadoEn: pago.creadoEn,
        pedidosAfectados: pago.aplicaciones.map((a) => ({
          pedidoId: a.pedidoId,
          montoAplicado: numero(a.montoAplicado),
        })),
      })),
      meta: { pagina, porPagina, total },
    };
  }
}
