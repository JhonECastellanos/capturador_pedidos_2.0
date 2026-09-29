import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { numero, Tx } from "../common/consecutivos";
import { aplicadoPorPedido } from "../dominio/cartera";
import { EstadoPedido, EstadoReserva, TipoMovimientoCaja, TipoMovimientoInventario } from "@prisma/client";

const CierreSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trasladar: z.array(z.string()).optional(),
  cancelar: z.array(z.string()).optional(),
  conteoEfectivo: z.number().min(0).optional(),
  conteoBilletera: z.number().min(0).optional(),
});

@Injectable()
export class CierresService {
  constructor(private readonly prisma: PrismaService) {}

  private fechaDe(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }

  async previsualizar(fechaISO: string) {
    const fecha = this.fechaDe(fechaISO);
    const inicio = fecha;
    const fin = new Date(fecha.getTime() + 24 * 60 * 60 * 1000);

    const pedidos = await this.prisma.pedido.findMany({
      where: { fechaOperacion: { gte: inicio, lt: fin }, estado: { not: EstadoPedido.CANCELADO } },
      include: { cliente: true },
      orderBy: { creadoEn: "asc" },
    });

    const aplicados = await aplicadoPorPedido(
      this.prisma,
      pedidos.map((p) => p.id),
    );

    const movimientos = await this.prisma.movimientoCaja.findMany({
      where: { fechaContable: { gte: inicio, lt: fin } },
    });

    const ingresos = movimientos.filter((m) => m.tipo === TipoMovimientoCaja.INGRESO);
    const egresos = movimientos.filter((m) => m.tipo === TipoMovimientoCaja.EGRESO);

    const pendientes = pedidos
      .map((p) => ({
        id: p.id,
        numero: p.numero,
        cliente: p.cliente.nombre,
        total: numero(p.total),
        saldoPendiente: Math.max(0, numero(p.total) - (aplicados.get(p.id) ?? 0)),
        estado: p.estado,
      }))
      .filter((p) => p.saldoPendiente > 0);

    return {
      fecha: fechaISO,
      totalVentas: pedidos.reduce((s, p) => s + numero(p.total), 0),
      pedidosCount: pedidos.length,
      totalIngresos: ingresos.reduce((s, m) => s + numero(m.monto), 0),
      totalEgresos: egresos.reduce((s, m) => s + numero(m.monto), 0),
      efectivoEsperado: ingresos.filter((m) => m.metodo === "EFECTIVO").reduce((s, m) => s + numero(m.monto), 0),
      billeteraEsperado: ingresos.filter((m) => m.metodo === "BILLETERA").reduce((s, m) => s + numero(m.monto), 0),
      pendientes,
    };
  }

  async crear(datos: z.infer<typeof CierreSchema>, usuarioId: string) {
    const fecha = this.fechaDe(datos.fecha);
    const existente = await this.prisma.cierreDia.findUnique({ where: { fecha } });
    if (existente) throw new ErrorDominio("CIERRE_YA_EXISTE", "Este día ya fue cerrado", 409);

    const resumen = await this.previsualizar(datos.fecha);

    const cierre = await this.prisma.$transaction(async (tx) => {
      const trasladados = datos.trasladar ?? [];
      const cancelados = datos.cancelar ?? [];

      const nuevoDia = new Date(); // "hoy" operativo para los trasladados

      const creado = await tx.cierreDia.create({
        data: {
          fecha,
          usuarioId,
          totalVentas: resumen.totalVentas,
          totalIngresos: resumen.totalIngresos,
          totalEgresos: resumen.totalEgresos,
          pedidosCount: resumen.pedidosCount,
          pendientesTrasladados: trasladados.length,
          pendientesCancelados: cancelados.length,
          cerradoEn: new Date(),
        },
      });

      for (const pedidoId of trasladados) {
        const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
        if (!pedido) continue;
        await tx.pedido.update({ where: { id: pedidoId }, data: { fechaOperacion: nuevoDia } });
        await tx.cierreAccion.create({
          data: {
            cierreId: creado.id,
            pedidoId,
            accion: "trasladar",
            fechaOperacionAnterior: fecha,
            fechaOperacionNueva: nuevoDia,
            usuarioId,
          },
        });
      }

      for (const pedidoId of cancelados) {
        await this.cancelarEnTx(tx, pedidoId, usuarioId);
        await tx.cierreAccion.create({
          data: {
            cierreId: creado.id,
            pedidoId,
            accion: "cancelar",
            fechaOperacionAnterior: fecha,
            usuarioId,
          },
        });
      }

      await tx.cierreMedio.create({
        data: {
          cierreId: creado.id,
          medio: "efectivo",
          esperado: resumen.efectivoEsperado,
          contado: datos.conteoEfectivo ?? 0,
          diferencia: (datos.conteoEfectivo ?? 0) - resumen.efectivoEsperado,
        },
      });
      await tx.cierreMedio.create({
        data: {
          cierreId: creado.id,
          medio: "billetera",
          esperado: resumen.billeteraEsperado,
          contado: datos.conteoBilletera ?? 0,
          diferencia: (datos.conteoBilletera ?? 0) - resumen.billeteraEsperado,
        },
      });

      return creado;
    });

    return {
      id: cierre.id,
      fecha: datos.fecha,
      usuarioId: cierre.usuarioId,
      totalVentas: numero(cierre.totalVentas),
      totalIngresos: numero(cierre.totalIngresos),
      totalEgresos: numero(cierre.totalEgresos),
      pedidosCount: cierre.pedidosCount,
      pendientesTrasladados: cierre.pendientesTrasladados,
      pendientesCancelados: cierre.pendientesCancelados,
      creadoEn: cierre.creadoEn,
    };
  }

  async historial(pagina = 1, porPagina = 20) {
    const [total, cierres] = await this.prisma.$transaction([
      this.prisma.cierreDia.count(),
      this.prisma.cierreDia.findMany({
        orderBy: { fecha: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { medios: true, usuario: true },
      }),
    ]);

    return {
      data: cierres.map((c) => ({
        id: c.id,
        fecha: c.fecha,
        usuario: c.usuario.nombre,
        totalVentas: numero(c.totalVentas),
        totalIngresos: numero(c.totalIngresos),
        totalEgresos: numero(c.totalEgresos),
        pedidosCount: c.pedidosCount,
        pendientesTrasladados: c.pendientesTrasladados,
        pendientesCancelados: c.pendientesCancelados,
        estado: c.estado.toLowerCase(),
        medios: c.medios.map((m) => ({
          medio: m.medio,
          esperado: numero(m.esperado),
          contado: numero(m.contado),
          diferencia: numero(m.diferencia),
        })),
        creadoEn: c.creadoEn,
      })),
      meta: { pagina, porPagina, total },
    };
  }

  private async cancelarEnTx(tx: Tx, pedidoId: string, usuarioId: string) {
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { lineas: true } });
    if (!pedido || pedido.estado === EstadoPedido.ENTREGADO || pedido.estado === EstadoPedido.CANCELADO) return;

    for (const linea of pedido.lineas) {
      const producto = await tx.producto.findUniqueOrThrow({ where: { id: linea.productoId } });
      await tx.producto.update({
        where: { id: linea.productoId },
        data: { stockReservado: { decrement: linea.cantidad } },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId: linea.productoId,
          tipo: TipoMovimientoInventario.LIBERACION_RESERVA,
          cantidad: linea.cantidad,
          deltaStockReservado: -linea.cantidad,
          stockFisicoAntes: producto.stockFisico,
          stockFisicoDespues: producto.stockFisico,
          stockReservadoAntes: producto.stockReservado,
          stockReservadoDespues: producto.stockReservado - linea.cantidad,
          pedidoId,
          usuarioId,
        },
      });
    }
    await tx.reservaStock.updateMany({
      where: { pedidoId },
      data: { estado: EstadoReserva.LIBERADA, liberadoEn: new Date() },
    });
    await tx.pedido.update({ where: { id: pedidoId }, data: { estado: EstadoPedido.CANCELADO, version: { increment: 1 } } });
    await tx.pedidoEstadoHistorial.create({ data: { pedidoId, estado: EstadoPedido.CANCELADO, usuarioId, comentario: "Cancelado en cierre" } });
  }
}
