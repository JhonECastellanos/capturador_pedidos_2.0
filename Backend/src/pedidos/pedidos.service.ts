import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero, Tx } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { aplicadoPorPedido } from "../dominio/cartera";
import { NuevoPedidoEsquema, LineaPedidoEsquema } from "@ambie/contrato";
import {
  EstadoPedido,
  MetodoPago,
  MomentoCobro,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
  Prisma,
} from "@prisma/client";

export const LineaPedidoSchema = LineaPedidoEsquema;
export const NuevoPedidoSchema = NuevoPedidoEsquema;

const MAP_METODO: Record<string, MetodoPago> = {
  efectivo: MetodoPago.EFECTIVO,
  billetera: MetodoPago.BILLETERA,
  credito: MetodoPago.CREDITO,
};

const MAP_MOMENTO: Record<string, MomentoCobro> = {
  inmediato: MomentoCobro.INMEDIATO,
  "al-entregar": MomentoCobro.AL_ENTREGAR,
  "segun-periodicidad": MomentoCobro.SEGUN_PERIODICIDAD,
};

const ESTADOS_VALIDOS: Record<string, EstadoPedido> = {
  pendiente: EstadoPedido.PENDIENTE,
  "en-preparacion": EstadoPedido.EN_PREPARACION,
  entregado: EstadoPedido.ENTREGADO,
  cancelado: EstadoPedido.CANCELADO,
};

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: {
    segmento?: string;
    estado?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    pagina?: number;
    porPagina?: number;
  }) {
    const where: Prisma.PedidoWhereInput[] = [];

    if (filtros.estado && filtros.estado !== "todos") {
      const estadoMapeado = ESTADOS_VALIDOS[filtros.estado];
      if (!estadoMapeado) throw new ErrorDominio("VALIDACION", "Estado inválido");
      where.push({ estado: estadoMapeado });
    }
    if (filtros.segmento === "hoy") where.push({ fechaOperacion: this.hoy() });
    if (filtros.desde || filtros.hasta) {
      const rango: Prisma.DateTimeFilter = {};
      // fechaOperacion es DATE, no un instante en la zona horaria del proceso.
      if (filtros.desde) rango.gte = new Date(`${filtros.desde}T00:00:00.000Z`);
      if (filtros.hasta) rango.lte = new Date(`${filtros.hasta}T00:00:00.000Z`);
      where.push({ fechaOperacion: rango });
    }

    const q = filtros.q?.trim();
    if (q) {
      const alternativas: Prisma.PedidoWhereInput[] = [
        { numero: { contains: q, mode: "insensitive" } },
        { cliente: { nombre: { contains: q, mode: "insensitive" } } },
        { cliente: { alias: { contains: q, mode: "insensitive" } } },
      ];
      if ("venta ocasional".includes(q.toLowerCase())) alternativas.push({ clienteId: null });
      where.push({ OR: alternativas });
    }
    const pagina = filtros.pagina ?? 1;
    const porPagina = filtros.porPagina ?? 20;
    const condicion: Prisma.PedidoWhereInput = { AND: where };
    const [total, pedidos] = await this.prisma.$transaction([
      this.prisma.pedido.count({ where: condicion }),
      this.prisma.pedido.findMany({
        where: condicion,
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { lineas: true, historial: true, cliente: true, factura: true },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const aplicados = await aplicadoPorPedido(
      this.prisma,
      pedidos.map((p) => p.id),
    );

    return {
      data: pedidos.map((p) => this.dto(p, aplicados)),
      meta: { pagina, porPagina, total },
    };
  }

  async obtener(pedidoId: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { lineas: true, historial: true, cliente: true, factura: true },
    });
    if (!pedido) throw new ErrorDominio("NO_ENCONTRADO", "Pedido no encontrado", 404);
    const aplicados = await aplicadoPorPedido(this.prisma, [pedido.id]);
    return this.dto(pedido, aplicados);
  }

  async crear(datos: z.infer<typeof NuevoPedidoSchema>, vendedorId: string) {
    if (!datos.clienteId && datos.metodo === "credito") throw new ErrorDominio("VALIDACION", "La venta ocasional no admite crédito");
    const metodo = MAP_METODO[datos.metodo];
    const estadoInicial = datos.estadoInicial === "entregado" ? EstadoPedido.ENTREGADO : EstadoPedido.PENDIENTE;

    // El momento de cobro se deriva de la modalidad y el estado inicial.
    const momentoCobro: MomentoCobro =
      (datos.momentoCobro ? MAP_MOMENTO[datos.momentoCobro] : undefined) ??
      (metodo === MetodoPago.CREDITO
        ? MomentoCobro.SEGUN_PERIODICIDAD
        : estadoInicial === EstadoPedido.ENTREGADO
          ? MomentoCobro.INMEDIATO
          : MomentoCobro.AL_ENTREGAR);

    const cliente = datos.clienteId ? await this.prisma.cliente.findUnique({ where: { id: datos.clienteId } }) : null;
    if (datos.clienteId && !cliente) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado", 404);

    const ids = [...new Set(datos.lineas.map((l) => l.productoId))].sort();

    const pedidoId = await this.prisma.$transaction(async (tx) => {
      if (datos.clienteId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datos.clienteId}))`;
      await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      // Bloquear productos en orden estable para evitar deadlocks.
      const productos = await tx.producto.findMany({
        where: { id: { in: ids }, activo: true },
        orderBy: { id: "asc" },
      });
      if (productos.length !== ids.length) throw new ErrorDominio("PRODUCTO_INVALIDO", "Hay productos inexistentes o inactivos");

      let subtotal = 0;
      const lineas = datos.lineas.map((linea) => {
        const producto = productos.find((p) => p.id === linea.productoId);
        if (!producto) throw new ErrorDominio("PRODUCTO_INVALIDO", "Producto no válido");
        const disponible = producto.stockFisico - producto.stockReservado;
        if (disponible < linea.cantidad) {
          throw new ErrorDominio("SOBREVENTA", `Stock insuficiente para ${producto.nombre}`);
        }
        const precio = numero(producto.precioVenta);
        const costo = numero(producto.costoActual);
        const sub = precio * linea.cantidad;
        subtotal += sub;
        return {
          producto,
          linea: {
            productoId: producto.id,
            nombre: producto.nombre,
            codigoInterno: producto.codigoInterno,
            unidad: producto.unidad,
            cantidad: linea.cantidad,
            precioUnitario: precio,
            costoUnitario: costo,
            subtotal: sub,
          },
        };
      });

      const numeroPedido = await siguienteCodigo(tx, "PED");
      const numeroFactura = await siguienteCodigo(tx, "FAC");

      const pedido = await tx.pedido.create({
        data: {
          numero: numeroPedido,
          clienteId: datos.clienteId,
          vendedorId,
          metodo,
          momentoCobro,
          estado: estadoInicial,
          subtotal,
          total: subtotal,
          fechaOperacion: this.hoy(),
          lineas: {
            create: lineas.map((l, i) => ({ ...l.linea, orden: i })),
          },
          historial: {
            create: {
              estado: estadoInicial,
              usuarioId: vendedorId,
            },
          },
        },
      });

      // Reserva de stock (y consumo inmediato si se entrega al crear).
      for (const { producto, linea } of lineas) {
        await tx.movimientoInventario.create({
          data: {
            productoId: producto.id,
            tipo: TipoMovimientoInventario.RESERVA,
            cantidad: linea.cantidad,
            deltaStockFisico: 0,
            deltaStockReservado: linea.cantidad,
            stockFisicoAntes: producto.stockFisico,
            stockFisicoDespues: producto.stockFisico,
            stockReservadoAntes: producto.stockReservado,
            stockReservadoDespues: producto.stockReservado + linea.cantidad,
            pedidoId: pedido.id,
            usuarioId: vendedorId,
          },
        });
      }

      const reservasCreadas = await Promise.all(
        lineas.map(async ({ producto, linea }) => {
          const pedidoLinea = await tx.pedidoLinea.findFirstOrThrow({
            where: { pedidoId: pedido.id, productoId: producto.id },
          });
          return tx.reservaStock.create({
            data: {
              pedidoId: pedido.id,
              pedidoLineaId: pedidoLinea.id,
              productoId: producto.id,
              cantidadReservada: linea.cantidad,
              usuarioId: vendedorId,
            },
          });
        }),
      );
      void reservasCreadas;

      for (const { producto, linea } of lineas) {
        await tx.producto.update({
          where: { id: producto.id },
          data: { stockReservado: { increment: linea.cantidad } },
        });
      }

      // Consumo inmediato si el pedido se entrega al crear.
      if (estadoInicial === EstadoPedido.ENTREGADO) {
        for (const { producto, linea } of lineas) {
          await tx.producto.update({
            where: { id: producto.id },
            data: {
              stockFisico: { decrement: linea.cantidad },
              stockReservado: { decrement: linea.cantidad },
            },
          });
          await tx.movimientoInventario.create({
            data: {
              productoId: producto.id,
              tipo: TipoMovimientoInventario.CONSUMO_PEDIDO,
              cantidad: linea.cantidad,
              deltaStockFisico: -linea.cantidad,
              deltaStockReservado: -linea.cantidad,
              stockFisicoAntes: producto.stockFisico,
              stockFisicoDespues: producto.stockFisico - linea.cantidad,
              stockReservadoAntes: producto.stockReservado + linea.cantidad,
              stockReservadoDespues: producto.stockReservado,
              pedidoId: pedido.id,
              usuarioId: vendedorId,
            },
          });
        }
        await tx.$executeRaw`UPDATE "reservasStock" SET estado = 'consumida', "cantidadConsumida" = "cantidadReservada", "cantidadLiberada" = 0, "consumidoEn" = ${new Date()} WHERE "pedidoId" = ${pedido.id}`;

      }
        if (metodo !== MetodoPago.CREDITO && (estadoInicial === EstadoPedido.ENTREGADO || momentoCobro === MomentoCobro.INMEDIATO)) {
          await this.registrarPagoEnTx(tx, {
            clienteId: cliente?.id ?? null,
            tipo: "PAGO_INICIAL",
            metodo,
            monto: subtotal,
            usuarioId: vendedorId,
            pedidoId: pedido.id,
            comentario: `Pago ${numeroPedido}`,
          });
        }

      // Factura interna.
      await tx.factura.create({
        data: {
          numero: numeroFactura,
          pedidoId: pedido.id,
          clienteId: cliente?.id ?? null,
          clienteNombre: cliente?.nombre ?? "Venta ocasional",
          clienteIdentificacion: cliente?.identificacion,
          clienteDireccion: cliente?.direccion,
          fechaOperacion: this.hoy(),
          subtotal,
          total: subtotal,
        },
      });

      return pedido.id;
    });

    return this.obtener(pedidoId);
  }

  async cambiarEstado(pedidoId: string, estado: EstadoPedido, usuarioId: string, comentario?: string) {
    await this.prisma.$transaction((tx) => this.cambiarEstadoEnTx(tx, pedidoId, estado, usuarioId, comentario));
    return this.obtener(pedidoId);
  }

  /** La misma transición atómica sirve al detalle y al cierre del día. */
  async cambiarEstadoEnTx(tx: Tx, pedidoId: string, estado: EstadoPedido, usuarioId: string, comentario?: string) {
      const referencia = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { clienteId: true } });
      if (!referencia) throw new ErrorDominio("NO_ENCONTRADO", "Pedido no encontrado", 404);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${referencia.clienteId ?? pedidoId}))`;
      await tx.$queryRaw`SELECT id FROM pedidos WHERE id = ${pedidoId} FOR UPDATE`;
      const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { lineas: true } });
      if (pedido.estado === estado) return;
      this.validarTransicion(pedido.estado, estado);
      const ids = pedido.lineas.map((l) => l.productoId).sort();
      await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      if (estado === EstadoPedido.ENTREGADO) {
        // Consumir reservas.
        const lineas = pedido.lineas;
        for (const linea of lineas) {
          const producto = await tx.producto.findUniqueOrThrow({ where: { id: linea.productoId } });
          await tx.producto.update({
            where: { id: linea.productoId },
            data: {
              stockFisico: { decrement: linea.cantidad },
              stockReservado: { decrement: linea.cantidad },
            },
          });
          await tx.movimientoInventario.create({
            data: {
              productoId: linea.productoId,
              tipo: TipoMovimientoInventario.CONSUMO_PEDIDO,
              cantidad: linea.cantidad,
              deltaStockFisico: -linea.cantidad,
              deltaStockReservado: -linea.cantidad,
              stockFisicoAntes: producto.stockFisico,
              stockFisicoDespues: producto.stockFisico - linea.cantidad,
              stockReservadoAntes: producto.stockReservado,
              stockReservadoDespues: producto.stockReservado - linea.cantidad,
              pedidoId: pedidoId,
              usuarioId,
            },
          });
        }
        await tx.$executeRaw`UPDATE "reservasStock" SET estado = 'consumida', "cantidadConsumida" = "cantidadReservada", "cantidadLiberada" = 0, "consumidoEn" = ${new Date()} WHERE "pedidoId" = ${pedidoId}`;
      }

      if (estado === EstadoPedido.CANCELADO) {
        const aplicaciones = await tx.pagoAplicacion.findMany({ where: { pedidoId, revertidoEn: null }, include: { pago: true } });
        for (const aplicacion of aplicaciones) {
          await tx.pagoAplicacion.update({ where: { id: aplicacion.id }, data: { revertidoEn: new Date() } });
          const reembolso = await tx.pago.create({ data: { clienteId: pedido.clienteId, tipo: "REEMBOLSO", metodo: aplicacion.pago.metodo, monto: aplicacion.montoAplicado, usuarioId, fechaOperacion: this.hoy(), reversionDePagoId: aplicacion.pagoId, comentario: `Cancelación ${pedido.numero}` } });
          await tx.movimientoCaja.create({ data: { tipo: TipoMovimientoCaja.EGRESO, concepto: `Reverso ${pedido.numero}`, monto: aplicacion.montoAplicado, metodo: aplicacion.pago.metodo, usuarioId, pagoId: reembolso.id, fechaContable: this.hoy() } });
        }
        await tx.factura.updateMany({ where: { pedidoId }, data: { estado: "ANULADA", anuladoEn: new Date(), motivoAnulacion: comentario ?? "Cancelación de pedido" } });
        // Liberar reservas.
        const lineas = pedido.lineas;
        for (const linea of lineas) {
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
              deltaStockFisico: 0,
              deltaStockReservado: -linea.cantidad,
              stockFisicoAntes: producto.stockFisico,
              stockFisicoDespues: producto.stockFisico,
              stockReservadoAntes: producto.stockReservado,
              stockReservadoDespues: producto.stockReservado - linea.cantidad,
              pedidoId: pedidoId,
              usuarioId,
            },
          });
        }
        await tx.$executeRaw`UPDATE "reservasStock" SET estado = 'liberada', "cantidadLiberada" = "cantidadReservada", "cantidadConsumida" = 0, "liberadoEn" = ${new Date()} WHERE "pedidoId" = ${pedidoId}`;
      }

      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado, version: { increment: 1 } },
      });
      await tx.pedidoEstadoHistorial.create({
        data: { pedidoId, estado, usuarioId, comentario },
      });
  }

  private validarTransicion(actual: EstadoPedido, siguiente: EstadoPedido) {
    const permitidas: Record<EstadoPedido, EstadoPedido[]> = {
      [EstadoPedido.PENDIENTE]: [EstadoPedido.EN_PREPARACION, EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
      [EstadoPedido.EN_PREPARACION]: [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
      [EstadoPedido.ENTREGADO]: [],
      [EstadoPedido.CANCELADO]: [],
    };
    if (!permitidas[actual].includes(siguiente)) {
      throw new ErrorDominio("TRANSICION_INVALIDA", `No se puede pasar de ${actual} a ${siguiente}`);
    }
  }

  async trasladar(pedidoId: string, usuarioId: string) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id: pedidoId } });
    if (!pedido) throw new ErrorDominio("NO_ENCONTRADO", "Pedido no encontrado", 404);
    if (pedido.estado !== EstadoPedido.PENDIENTE && pedido.estado !== EstadoPedido.EN_PREPARACION) throw new ErrorDominio("TRANSICION_INVALIDA", "Solo se reprograman pedidos por entregar");
    const hoy = this.hoy();
    const destino = pedido.fechaOperacion.getTime() < hoy.getTime() ? hoy : new Date(hoy.getTime() + 86400000);
    await this.prisma.$transaction([
      this.prisma.pedido.update({ where: { id: pedidoId }, data: { fechaOperacion: destino, version: { increment: 1 } } }),
      this.prisma.auditoriaEvento.create({ data: { entidadTipo: "pedido", entidadId: pedidoId, accion: "reprogramar", usuarioId,
        datosAntes: { fechaOperacion: pedido.fechaOperacion.toISOString() }, datosDespues: { fechaOperacion: destino.toISOString() } } }),
    ]);
    return this.obtener(pedidoId);
  }

  /** Registra un pago y su caja dentro de una transacción dada. */
  private async registrarPagoEnTx(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    datos: {
      clienteId: string | null;
      tipo: "PAGO_INICIAL" | "ABONO" | "REEMBOLSO";
      metodo: MetodoPago;
      monto: number;
      usuarioId: string;
      pedidoId: string;
      comentario?: string;
    },
  ) {
    const pago = await tx.pago.create({
      data: {
        clienteId: datos.clienteId,
        tipo: datos.tipo,
        metodo: datos.metodo,
        monto: datos.monto,
        usuarioId: datos.usuarioId,
        comentario: datos.comentario,
        fechaOperacion: this.hoy(),
      },
    });
    await tx.pagoAplicacion.create({
      data: {
        pagoId: pago.id,
        pedidoId: datos.pedidoId,
        montoAplicado: datos.monto,
        orden: 0,
      },
    });
    await tx.movimientoCaja.create({
      data: {
        tipo: TipoMovimientoCaja.INGRESO,
        concepto: datos.tipo === "ABONO" ? "Abono crédito" : `Pago ${datos.comentario ?? ""}`.trim() || "Pago",
        monto: datos.monto,
        metodo: datos.metodo,
        usuarioId: datos.usuarioId,
        pagoId: pago.id,
        fechaContable: this.hoy(),
      },
    });
    return pago;
  }

  private hoy(): Date {
    return hoyLocal();
  }

  private dto(
    p: {
      id: string;
      numero: string;
      clienteId: string | null;
      vendedorId: string;
      metodo: MetodoPago;
      estado: EstadoPedido;
      subtotal: import("@prisma/client").Prisma.Decimal;
      total: import("@prisma/client").Prisma.Decimal;
      creadoEn: Date;
      fechaOperacion: Date;
      lineas: Array<{
        productoId: string;
        nombre: string;
        cantidad: number;
        precioUnitario: import("@prisma/client").Prisma.Decimal;
        costoUnitario: import("@prisma/client").Prisma.Decimal;
        subtotal: import("@prisma/client").Prisma.Decimal;
      }>;
      historial: Array<{ estado: EstadoPedido; usuarioId: string; fecha: Date }>;
      factura: { numero: string } | null;
      cliente?: { nombre: string } | null;
      comprobantePagoAdjuntoId?: string | null;
    },
    aplicados: Map<string, number>,
  ) {
    const total = numero(p.total);
    const aplicado = aplicados.get(p.id) ?? 0;
    const saldo = p.estado === EstadoPedido.CANCELADO ? 0 : Math.max(0, total - aplicado);
    return {
      id: p.id,
      numero: p.numero,
      clienteId: p.clienteId,
      clienteNombre: p.cliente?.nombre ?? "Venta ocasional",
      comprobantePagoAdjuntoId: p.comprobantePagoAdjuntoId ?? null,
      vendedorId: p.vendedorId,
      lineas: p.lineas.map((l) => ({
        productoId: l.productoId,
        nombre: l.nombre,
        cantidad: l.cantidad,
        precioUnitario: numero(l.precioUnitario),
        costoUnitario: numero(l.costoUnitario),
        subtotal: numero(l.subtotal),
      })),
      subtotal: numero(p.subtotal),
      total,
      pago: {
        metodo: p.metodo.toLowerCase(),
        montoRecibido: aplicado,
        saldoPendiente: saldo,
        estado: saldo > 0 ? "pendiente" : "pagado",
        recordatorioWhatsApp: p.metodo === MetodoPago.CREDITO && saldo > 0,
      },
      estado: p.estado.toLowerCase().replaceAll("_", "-"),
      facturaNumero: p.factura?.numero ?? null,
      creadoEn: p.creadoEn,
      fechaOperacion: p.fechaOperacion,
      historialEstados: p.historial.map((h) => ({
        estado: h.estado.toLowerCase().replaceAll("_", "-"),
        usuarioId: h.usuarioId,
        fecha: h.fecha,
      })),
    };
  }
}
