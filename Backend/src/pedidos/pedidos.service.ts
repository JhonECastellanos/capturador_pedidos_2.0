import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero, Tx } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { aplicadoPorPedido } from "../dominio/cartera";
import {
  EstadoPedido,
  EstadoReserva,
  MetodoPago,
  MomentoCobro,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
} from "@prisma/client";

export const LineaPedidoSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().int().min(1),
});

export const NuevoPedidoSchema = z.object({
  clienteId: z.string().min(1),
  vendedorId: z.string().optional(),
  lineas: z.array(LineaPedidoSchema).min(1),
  metodo: z.enum(["efectivo", "billetera", "credito"]),
  estadoInicial: z.enum(["pendiente", "entregado"]).optional(),
  momentoCobro: z.enum(["inmediato", "al-entregar", "segun-periodicidad"]).optional(),
});

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
    const where: Record<string, unknown>[] = [];

    if (filtros.estado && filtros.estado !== "todos") {
      const estadoMapeado = ESTADOS_VALIDOS[filtros.estado];
      if (!estadoMapeado) throw new ErrorDominio("VALIDACION", "Estado inválido");
      where.push({ estado: estadoMapeado });
    }
    if (filtros.segmento === "hoy") where.push({ fechaOperacion: this.hoy() });
    if (filtros.desde || filtros.hasta) {
      const rango: Record<string, unknown> = {};
      if (filtros.desde) rango.gte = new Date(`${filtros.desde}T00:00:00`);
      if (filtros.hasta) rango.lte = new Date(`${filtros.hasta}T23:59:59.999`);
      where.push({ fechaOperacion: rango });
    }

    const pedidos = await this.prisma.pedido.findMany({
      where: { AND: where.length > 0 ? where : undefined },
      orderBy: { creadoEn: "desc" },
      include: { lineas: true, historial: true, cliente: true, factura: true },
    });

    const aplicados = await aplicadoPorPedido(
      this.prisma,
      pedidos.map((p) => p.id),
    );

    const filtrados = pedidos.filter((p) => {
      if (filtros.q) {
        const q = filtros.q.toLowerCase();
        const coincide = p.numero.toLowerCase().includes(q) || p.cliente.nombre.toLowerCase().includes(q);
        if (!coincide) return false;
      }
      return true;
    });

    const total = filtrados.length;
    const inicio = ((filtros.pagina ?? 1) - 1) * (filtros.porPagina ?? 20);
    const paginaDatos = filtrados.slice(inicio, inicio + (filtros.porPagina ?? 20));

    return {
      data: paginaDatos.map((p) => this.dto(p, aplicados)),
      meta: { pagina: filtros.pagina ?? 1, porPagina: filtros.porPagina ?? 20, total },
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

    const cliente = await this.prisma.cliente.findUnique({ where: { id: datos.clienteId } });
    if (!cliente) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado", 404);

    const ids = [...new Set(datos.lineas.map((l) => l.productoId))].sort();

    const pedidoId = await this.prisma.$transaction(async (tx) => {
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
        await tx.reservaStock.updateMany({
          where: { pedidoId: pedido.id },
          data: { estado: EstadoReserva.CONSUMIDA, consumidoEn: new Date() },
        });

        // Cobro inmediato (efectivo/billetera al entregar).
        if (metodo !== MetodoPago.CREDITO) {
          await this.registrarPagoEnTx(tx, {
            clienteId: cliente.id,
            tipo: "PAGO_INICIAL",
            metodo,
            monto: subtotal,
            usuarioId: vendedorId,
            pedidoId: pedido.id,
            comentario: `Pago ${numeroPedido}`,
          });
        }
      }

      // Factura interna.
      await tx.factura.create({
        data: {
          numero: numeroFactura,
          pedidoId: pedido.id,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          clienteIdentificacion: cliente.identificacion,
          clienteDireccion: cliente.direccion,
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
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { lineas: true },
    });
    if (!pedido) throw new ErrorDominio("NO_ENCONTRADO", "Pedido no encontrado", 404);
    if (pedido.estado === estado) return this.obtener(pedidoId);

    this.validarTransicion(pedido.estado, estado);

    await this.prisma.$transaction(async (tx) => {
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
        await tx.reservaStock.updateMany({
          where: { pedidoId },
          data: { estado: EstadoReserva.CONSUMIDA, consumidoEn: new Date() },
        });
      }

      if (estado === EstadoPedido.CANCELADO) {
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
        await tx.reservaStock.updateMany({
          where: { pedidoId },
          data: { estado: EstadoReserva.LIBERADA, liberadoEn: new Date() },
        });
      }

      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado, version: { increment: 1 } },
      });
      await tx.pedidoEstadoHistorial.create({
        data: { pedidoId, estado, usuarioId, comentario },
      });
    });

    return this.obtener(pedidoId);
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

  /** Registra un pago y su caja dentro de una transacción dada. */
  private async registrarPagoEnTx(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    datos: {
      clienteId: string;
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
      clienteId: string;
      vendedorId: string;
      metodo: MetodoPago;
      estado: EstadoPedido;
      subtotal: import("@prisma/client").Prisma.Decimal;
      total: import("@prisma/client").Prisma.Decimal;
      creadoEn: Date;
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
    },
    aplicados: Map<string, number>,
  ) {
    const total = numero(p.total);
    const aplicado = aplicados.get(p.id) ?? 0;
    const saldo = Math.max(0, total - aplicado);
    return {
      id: p.id,
      numero: p.numero,
      clienteId: p.clienteId,
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
      estado: p.estado,
      facturaNumero: p.factura?.numero ?? null,
      creadoEn: p.creadoEn,
      historialEstados: p.historial.map((h) => ({
        estado: h.estado,
        usuarioId: h.usuarioId,
        fecha: h.fecha,
      })),
    };
  }
}
