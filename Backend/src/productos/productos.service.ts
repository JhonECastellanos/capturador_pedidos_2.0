import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero } from "../common/consecutivos";
import { Prisma } from "@prisma/client";

export const NuevoProductoSchema = z.object({
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  unidad: z.string().optional(),
  precioVenta: z.number().min(0),
  costoActual: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  stockMinimo: z.number().int().min(0).optional(),
});

const COLORES = ["#e88f2a", "#3c6b3a", "#7d5a38", "#d97b96", "#304d25", "#b5442e"];

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(q?: string, categoria?: string, stockEstado?: string, pagina = 1, porPagina = 20) {
    const condiciones: Prisma.ProductoWhereInput[] = [];
    if (q) {
      condiciones.push({
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { codigoInterno: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (categoria && categoria !== "Todas") {
      condiciones.push({ categoria: { nombre: categoria } });
    }

    const where: Prisma.ProductoWhereInput = condiciones.length > 0 ? { AND: condiciones } : {};

    const productos = await this.prisma.producto.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      include: { categoria: true },
    });

    const filtrados = productos.filter((p) => {
      if (stockEstado === "alerta") return p.stockFisico <= p.stockMinimo;
      if (stockEstado === "ok") return p.stockFisico > p.stockMinimo;
      return true;
    });

    const total = filtrados.length;
    const inicio = (pagina - 1) * porPagina;
    const paginaDatos = filtrados.slice(inicio, inicio + porPagina);

    return {
      data: paginaDatos.map((p) => this.dto(p)),
      meta: { pagina, porPagina, total },
    };
  }

  async obtener(productoId: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      include: { categoria: true },
    });
    if (!producto) throw new ErrorDominio("NO_ENCONTRADO", "Producto no encontrado", 404);
    return this.dto(producto);
  }

  async listarCambios(pagina: number, porPagina: number) {
    const [total, cambios] = await this.prisma.$transaction([
      this.prisma.cambioPrecio.count(),
      this.prisma.cambioPrecio.findMany({ orderBy: { fecha: "desc" }, skip: (pagina - 1) * porPagina, take: porPagina }),
    ]);
    return { data: cambios.map((c) => ({ ...c, valorAnterior: numero(c.valorAnterior), valorNuevo: numero(c.valorNuevo) })), meta: { pagina, porPagina, total } };
  }

  async crear(datos: z.infer<typeof NuevoProductoSchema>) {
    const categoria = datos.categoria
      ? await this.prisma.categoria.upsert({
          where: { nombre: datos.categoria },
          update: {},
          create: { codigo: `CAT-${datos.categoria.slice(0, 8).toUpperCase()}`, nombre: datos.categoria },
        })
      : null;

    const total = await this.prisma.producto.count();

    const producto = await this.prisma.$transaction(async (tx) => {
      // El catálogo permanece estable mientras se aplica el punto de partida.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
      const codigoInterno = await siguienteCodigo(tx, "PROD");
      const creado = await tx.producto.create({
        data: {
          codigoInterno,
          nombre: datos.nombre.trim(),
          categoriaId: categoria?.id ?? null,
          unidad: datos.unidad?.trim() || "unidad",
          precioVenta: datos.precioVenta,
          costoActual: datos.costoActual ?? 0,
          stockFisico: datos.stock ?? 0,
          stockMinimo: datos.stockMinimo ?? 0,
          colorEtiqueta: COLORES[total % COLORES.length],
        },
      });
      // Registrar stock inicial en el ledger.
      await tx.movimientoInventario.create({
        data: {
          productoId: creado.id,
          tipo: "INICIALIZACION",
          cantidad: creado.stockFisico,
          deltaStockFisico: creado.stockFisico,
          stockFisicoAntes: 0,
          stockFisicoDespues: creado.stockFisico,
          motivo: "Creación de producto",
        },
      });
      return creado;
    });

    return this.obtener(producto.id);
  }

  /**
   * Historial de cambios de precio de un producto.
   * Permite reconstruir a qué precio se vendió cada pedido en el pasado,
   * porque el precio actual no dice nada sobre pedidos ya cerrados.
   */
  async historialPrecios(productoId: string, limite = 50) {
    const cambios = await this.prisma.cambioPrecio.findMany({
      where: { productoId },
      orderBy: { fecha: "desc" },
      take: limite,
      include: { usuario: { select: { id: true, nombre: true, codigo: true } } },
    });

    return {
      data: cambios.map((c) => ({
        id: c.id,
        productoId: c.productoId,
        valorAnterior: numero(c.valorAnterior),
        valorNuevo: numero(c.valorNuevo),
        usuario: c.usuario,
        fecha: c.fecha,
      })),
      meta: { total: cambios.length },
    };
  }

  async actualizarPrecio(productoId: string, nuevoPrecio: number, usuarioId: string) {
    const producto = await this.prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) throw new ErrorDominio("NO_ENCONTRADO", "Producto no encontrado", 404);
    if (numero(producto.precioVenta) === nuevoPrecio) return this.obtener(productoId);

    await this.prisma.$transaction([
      this.prisma.cambioPrecio.create({
        data: {
          productoId,
          valorAnterior: producto.precioVenta,
          valorNuevo: nuevoPrecio,
          usuarioId,
        },
      }),
      this.prisma.producto.update({
        where: { id: productoId },
        data: { precioVenta: nuevoPrecio, version: { increment: 1 } },
      }),
    ]);

    return this.obtener(productoId);
  }

  private dto(p: {
    id: string;
    codigoInterno: string;
    nombre: string;
    unidad: string;
    precioVenta: Prisma.Decimal;
    costoActual: Prisma.Decimal;
    stockFisico: number;
    stockReservado: number;
    stockMinimo: number;
    colorEtiqueta: string;
    activo: boolean;
    creadoEn: Date;
    categoria: { nombre: string } | null;
  }) {
    return {
      id: p.id,
      codigoInterno: p.codigoInterno,
      nombre: p.nombre,
      categoria: p.categoria?.nombre ?? "",
      unidad: p.unidad,
      precioVenta: numero(p.precioVenta),
      costoActual: numero(p.costoActual),
      stock: p.stockFisico - p.stockReservado,
      stockFisico: p.stockFisico,
      stockReservado: p.stockReservado,
      stockDisponible: p.stockFisico - p.stockReservado,
      stockMinimo: p.stockMinimo,
      colorEtiqueta: p.colorEtiqueta,
      activo: p.activo,
      creadoEn: p.creadoEn,
    };
  }
}
