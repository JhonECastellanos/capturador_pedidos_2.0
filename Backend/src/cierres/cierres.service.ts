import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { numero, Tx } from "../common/consecutivos";
import { aplicadoPorPedido } from "../dominio/cartera";
import { hoyLocal } from "../common/crypto";
import { EstadoPedido, TipoMovimientoCaja, Prisma } from "@prisma/client";
import { PedidosService } from "../pedidos/pedidos.service";

const CierreSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trasladar: z.array(z.string()).optional(),
  cancelar: z.array(z.string()).optional(),
  conteoEfectivo: z.number().min(0).optional(),
  conteoBilletera: z.number().min(0).optional(),
});

@Injectable()
export class CierresService {
  constructor(private readonly prisma: PrismaService, private readonly pedidos: PedidosService) {}

  private fechaDe(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }

  async previsualizar(fechaISO: string, tx: Tx = this.prisma) {
    const fecha = this.fechaDe(fechaISO);
    const inicio = fecha;
    const fin = new Date(fecha.getTime() + 24 * 60 * 60 * 1000);

    const pedidos = await tx.pedido.findMany({
      where: { fechaOperacion: { gte: inicio, lt: fin }, estado: { not: EstadoPedido.CANCELADO } },
      include: { cliente: true },
      orderBy: { creadoEn: "asc" },
    });

    const aplicados = await aplicadoPorPedido(
      tx,
      pedidos.map((p) => p.id),
    );

    const movimientos = await tx.movimientoCaja.findMany({
      where: { fechaContable: { gte: inicio, lt: fin } },
    });

    const ingresos = movimientos.filter((m) => m.tipo === TipoMovimientoCaja.INGRESO);
    const egresos = movimientos.filter((m) => m.tipo === TipoMovimientoCaja.EGRESO);

    const pendientes = pedidos
      .map((p) => ({
        id: p.id,
        numero: p.numero,
        cliente: p.cliente?.nombre ?? "Venta ocasional",
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
      efectivoEsperado: movimientos.filter((m) => m.metodo === "EFECTIVO").reduce((s, m) => s + (m.tipo === TipoMovimientoCaja.INGRESO ? numero(m.monto) : -numero(m.monto)), 0),
      billeteraEsperado: movimientos.filter((m) => m.metodo === "BILLETERA").reduce((s, m) => s + (m.tipo === TipoMovimientoCaja.INGRESO ? numero(m.monto) : -numero(m.monto)), 0),
      pendientes,
    };
  }

  async crear(datos: z.infer<typeof CierreSchema>, usuarioId: string) {
    const fecha = this.fechaDe(datos.fecha);
    const cierre = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre:${datos.fecha}`}))`;
      if (await tx.cierreDia.findUnique({ where: { fecha } })) throw new ErrorDominio("CIERRE_YA_EXISTE", "Este día ya fue cerrado", 409);
      const trasladados = datos.trasladar ?? [];
      const cancelados = datos.cancelar ?? [];
      const acciones = [...trasladados, ...cancelados];
      if (new Set(acciones).size !== acciones.length) throw new ErrorDominio("VALIDACION", "Un pedido no puede tener dos acciones en el cierre");
      if (acciones.length) {
        const referencias = await tx.pedido.findMany({ where: { id: { in: acciones } }, include: { lineas: true } });
        if (referencias.length !== acciones.length) throw new ErrorDominio("NO_ENCONTRADO", "Hay pedidos inexistentes", 404);
        for (const clienteId of [...new Set(referencias.map((p) => p.clienteId))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clienteId}))`;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM pedidos WHERE id IN (${Prisma.join(acciones)}) ORDER BY id FOR UPDATE`);
        const actuales = await tx.pedido.findMany({ where: { id: { in: acciones } } });
        if (actuales.some((p) => p.fechaOperacion.getTime() !== fecha.getTime() || ![EstadoPedido.PENDIENTE, EstadoPedido.EN_PREPARACION].includes(p.estado as typeof EstadoPedido.PENDIENTE))) throw new ErrorDominio("CIERRE_ACCION_INVALIDA", "Solo se gestionan pedidos por entregar del día seleccionado");
        const productos = [...new Set(referencias.flatMap((p) => p.lineas.map((l) => l.productoId)))].sort();
        if (productos.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join(productos)}) ORDER BY id FOR UPDATE`);
      }
      let resumen = await this.previsualizar(datos.fecha, tx);

      const hoy = hoyLocal();
      const nuevoDia = fecha.getTime() < hoy.getTime() ? hoy : new Date(hoy.getTime() + 86400000);

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
        await this.pedidos.cambiarEstadoEnTx(tx, pedidoId, EstadoPedido.CANCELADO, usuarioId, "Cancelado en cierre");
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

      resumen = await this.previsualizar(datos.fecha, tx);
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

      return tx.cierreDia.update({ where: { id: creado.id }, data: { totalVentas: resumen.totalVentas, totalIngresos: resumen.totalIngresos, totalEgresos: resumen.totalEgresos, pedidosCount: resumen.pedidosCount } });
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
        usuarioId: c.usuarioId,
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
        conteoEfectivo: c.medios.find((m) => m.medio === "efectivo") ? numero(c.medios.find((m) => m.medio === "efectivo")!.contado) : undefined,
        conteoBilletera: c.medios.find((m) => m.medio === "billetera") ? numero(c.medios.find((m) => m.medio === "billetera")!.contado) : undefined,
        diferenciaEfectivo: c.medios.find((m) => m.medio === "efectivo") ? numero(c.medios.find((m) => m.medio === "efectivo")!.diferencia) : undefined,
        diferenciaBilletera: c.medios.find((m) => m.medio === "billetera") ? numero(c.medios.find((m) => m.medio === "billetera")!.diferencia) : undefined,
      })),
      meta: { pagina, porPagina, total },
    };
  }

}
