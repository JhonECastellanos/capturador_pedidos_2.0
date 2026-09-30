import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { MetodoPago, TipoMovimientoCaja, TipoMovimientoInventario, Prisma } from "@prisma/client";

const RecepcionSchema = z.object({
  proveedorId: z.string().min(1),
  lineas: z
    .array(z.object({ productoId: z.string().min(1), cantidad: z.number().int().min(1), costoUnitario: z.number().min(0) }))
    .min(1),
  descontarCaja: z.boolean().optional(),
});

const GastoSchema = z.object({
  concepto: z.string().min(1),
  monto: z.number().positive(),
  metodo: z.enum(["efectivo", "billetera"]).optional(),
});

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async listarProveedores() {
    return { data: await this.prisma.proveedor.findMany({ orderBy: { creadoEn: "desc" } }) };
  }

  async crearProveedor(nombre: string, telefono?: string) {
    const proveedor = await this.prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigo(tx, "PRV");
      return tx.proveedor.create({ data: { codigo, nombre: nombre.trim(), telefono: telefono?.trim() || null } });
    });
    return proveedor;
  }

  async listarRecepciones(pagina = 1, porPagina = 20) {
    const [total, recepciones] = await this.prisma.$transaction([
      this.prisma.recepcionCompra.count(),
      this.prisma.recepcionCompra.findMany({
        orderBy: { creadoEn: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { proveedor: true, lineas: true },
      }),
    ]);
    return {
      data: recepciones.map((r) => ({
        id: r.id,
        numero: r.numero,
        proveedorId: r.proveedorId,
        proveedor: r.proveedor.nombre,
        total: numero(r.total),
        descontarCaja: r.descontarCaja,
        creadoEn: r.creadoEn,
        lineas: r.lineas.map((l) => ({
          productoId: l.productoId,
          nombre: l.nombre,
          codigoInterno: l.codigoInterno,
          cantidad: l.cantidad,
          costoUnitario: numero(l.costoUnitario),
          subtotal: numero(l.subtotal),
        })),
      })),
      meta: { pagina, porPagina, total },
    };
  }

  async listarGastos(filtros: { desde?: string; hasta?: string; pagina?: number; porPagina?: number } = {}) {
    const pagina = filtros.pagina ?? 1;
    const porPagina = filtros.porPagina ?? 20;
    // El rango se filtra por fechaOperacion (el día real del gasto), no por
    // creadoEn: así el cierre del día cuadra con lo registrado ese mismo día.
    const where: Record<string, unknown> = {};
    if (filtros.desde || filtros.hasta) {
      where.fechaOperacion = {
        ...(filtros.desde ? { gte: new Date(`${filtros.desde}T00:00:00.000Z`) } : {}),
        ...(filtros.hasta ? { lte: new Date(`${filtros.hasta}T00:00:00.000Z`) } : {}),
      };
    }

    const [total, gastos] = await this.prisma.$transaction([
      this.prisma.gasto.count({ where }),
      this.prisma.gasto.findMany({
        where,
        orderBy: [{ fechaOperacion: "desc" }, { creadoEn: "desc" }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { usuario: { select: { id: true, nombre: true, codigo: true } } },
      }),
    ]);

    return {
      data: gastos.map((g) => ({
        id: g.id,
        concepto: g.concepto,
        monto: numero(g.monto),
        metodo: g.metodo,
        estado: g.estado,
        comentario: g.comentario,
        usuario: g.usuario,
        fechaOperacion: g.fechaOperacion,
        creadoEn: g.creadoEn,
      })),
      meta: { pagina, porPagina, total },
    };
  }

  async registrarRecepcion(datos: z.infer<typeof RecepcionSchema>, usuarioId: string) {
    const ids = [...new Set(datos.lineas.map((l) => l.productoId))].sort();

    const recepcion = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      const productos = await tx.producto.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
      if (productos.length !== ids.length) throw new ErrorDominio("PRODUCTO_INVALIDO", "Hay productos inexistentes");

      const numeroRecepcion = await siguienteCodigo(tx, "REC");

      let total = 0;
      const lineas = datos.lineas.map((l) => {
        const producto = productos.find((p) => p.id === l.productoId) as (typeof productos)[number];
        const sub = l.cantidad * l.costoUnitario;
        total += sub;
        return {
          productoId: l.productoId,
          codigoInterno: producto.codigoInterno,
          nombre: producto.nombre,
          cantidad: l.cantidad,
          costoUnitario: l.costoUnitario,
          subtotal: sub,
        };
      });

      const recepcion = await tx.recepcionCompra.create({
        data: {
          numero: numeroRecepcion,
          proveedorId: datos.proveedorId,
          usuarioId,
          total,
          descontarCaja: datos.descontarCaja ?? false,
          fechaOperacion: hoyLocal(),
          lineas: { create: lineas },
        },
      });

      for (const { productoId, cantidad, costoUnitario } of lineas) {
        const producto = productos.find((p) => p.id === productoId) as (typeof productos)[number];
        await tx.producto.update({
          where: { id: productoId },
          data: { stockFisico: { increment: cantidad }, costoActual: costoUnitario },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId,
            tipo: TipoMovimientoInventario.RECEPCION_COMPRA,
            cantidad,
            deltaStockFisico: cantidad,
            stockFisicoAntes: producto.stockFisico,
            stockFisicoDespues: producto.stockFisico + cantidad,
            stockReservadoAntes: producto.stockReservado,
            stockReservadoDespues: producto.stockReservado,
            recepcionCompraId: recepcion.id,
            usuarioId,
          },
        });
      }

      if (datos.descontarCaja) {
        await tx.movimientoCaja.create({
          data: {
            tipo: TipoMovimientoCaja.EGRESO,
            concepto: `Compra ${numeroRecepcion}`,
            monto: total,
            metodo: MetodoPago.EFECTIVO,
            usuarioId,
            recepcionCompraId: recepcion.id,
            fechaContable: hoyLocal(),
          },
        });
      }

      return recepcion;
    });

    return {
      id: recepcion.id,
      numero: recepcion.numero,
      total: numero(recepcion.total),
      descontarCaja: recepcion.descontarCaja,
      creadoEn: recepcion.creadoEn,
    };
  }

  async registrarGasto(datos: z.infer<typeof GastoSchema>, usuarioId: string) {
    const metodo = datos.metodo === "billetera" ? MetodoPago.BILLETERA : MetodoPago.EFECTIVO;

    const gasto = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.gasto.create({
        data: {
          concepto: datos.concepto.trim(),
          monto: datos.monto,
          metodo,
          usuarioId,
          fechaOperacion: hoyLocal(),
        },
      });
      await tx.movimientoCaja.create({
        data: {
          tipo: TipoMovimientoCaja.EGRESO,
          concepto: datos.concepto.trim(),
          monto: datos.monto,
          metodo,
          usuarioId,
          gastoId: creado.id,
          fechaContable: hoyLocal(),
        },
      });
      return creado;
    });

    return { id: gasto.id, concepto: gasto.concepto, monto: numero(gasto.monto), creadoEn: gasto.creadoEn };
  }
}
