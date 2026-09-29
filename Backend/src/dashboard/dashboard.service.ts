import { Injectable } from "@nestjs/common";
import { Prisma, EstadoPedido, MetodoPago } from "@prisma/client";
import { PrismaService } from "../common/prisma.module";
import { numero } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { aplicadoPorPedido } from "../dominio/cartera";

/** Filtros del tablero. Todos son opcionales. */
export interface FiltrosTablero {
  desde?: string;
  hasta?: string;
  clienteId?: string;
  vendedorId?: string;
  /** Días hacia atrás cuando no se indica un rango. */
  dias?: number;
}

type FilaVentaDiaria = { dia: Date; ventas: number | bigint; pedidos: number | bigint };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tablero del administrador.
   *
   * Todo se calcula con agregaciones en la base de datos. Antes se cargaban
   * todos los pedidos con sus líneas para sumarlos en memoria, lo que no
   * escalaba: con dos años de historial la consulta se caía.
   */
  async resumen(filtros: FiltrosTablero = {}) {
    const { desde, hasta } = this.rango(filtros);
    const where = this.filtroPedidos(desde, hasta, filtros);

    const [agregado, alertasStock, credito, gastos, compras] = await Promise.all([
      this.prisma.pedido.aggregate({
        where,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.producto.count({ where: { stockFisico: { lte: 0 } } }),
      this.creditoPendiente(where),
      this.prisma.gasto.aggregate({ where: { fechaOperacion: this.filtroFecha(desde, hasta) }, _sum: { monto: true } }),
      this.prisma.recepcionCompra.aggregate({ where: { fechaOperacion: this.filtroFecha(desde, hasta) }, _sum: { total: true } }),
    ]);

    const [serie, topProductos, topClientes, porMetodo] = await Promise.all([
      this.serieDiaria(desde, hasta, filtros),
      this.topProductos(desde, hasta, filtros),
      this.topClientes(desde, hasta, filtros),
      this.ventasPorMetodo(where),
    ]);

    const ventas = numero(agregado._sum?.total ?? 0);
    const pedidos = agregado._count._all;
    const totalCompras = numero(compras._sum?.total ?? 0);

    return {
      rango: { desde, hasta },
      ventas,
      pedidos,
      ticketPromedio: pedidos > 0 ? Math.round((ventas / pedidos) * 100) / 100 : 0,
      gastos: numero(gastos._sum?.monto ?? 0),
      compras: totalCompras,
      utilidad: Math.round((ventas - totalCompras) * 100) / 100,
      creditoPendiente: credito,
      alertasStock,
      porMetodo,
      serie,
      topProductos,
      topClientes,
    };
  }

  // ─── Filtros y rangos ───────────────────────────────────────────

  /** Convierte los filtros en un rango de fechas ISO (yyyy-mm-dd). */
  private rango(filtros: FiltrosTablero): { desde: string; hasta: string } {
    const hoy = hoyLocal();
    const hasta = filtros.hasta ?? this.aISO(hoy);
    if (filtros.desde) return { desde: filtros.desde, hasta };
    const dias = Math.max(1, Math.min(filtros.dias ?? 30, 365));
    const inicio = new Date(hoy.getTime() - (dias - 1) * 24 * 60 * 60 * 1000);
    return { desde: this.aISO(inicio), hasta };
  }

  private aISO(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  /**
   * Traduce el rango a un intervalo sobre `fechaOperacion`, que es un DATE.
   * El límite superior se deja exclusivo para no repetir el último día.
   */
  private filtroFecha(desde: string, hasta: string): Prisma.DateTimeFilter {
    const fin = new Date(`${hasta}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000;
    return { gte: new Date(`${desde}T00:00:00.000Z`), lt: new Date(fin) };
  }

  private filtroPedidos(desde: string, hasta: string, filtros: FiltrosTablero): Prisma.PedidoWhereInput {
    const where: Prisma.PedidoWhereInput = {
      fechaOperacion: this.filtroFecha(desde, hasta),
      // Un pedido cancelado no fue venta: excluirlo mantiene la suma cuadrada
      // con el histórico de caja, que sí lo revierte.
      estado: { not: EstadoPedido.CANCELADO },
    };
    if (filtros.clienteId) where.clienteId = filtros.clienteId;
    if (filtros.vendedorId) where.vendedorId = filtros.vendedorId;
    return where;
  }

  // ─── Agregaciones ───────────────────────────────────────────────

  /**
   * Ventas agrupadas por día.
   * Va en SQL directo porque Prisma no agrupa por día (una fecha) sin traer
   * cada fila a memoria.
   */
  private async serieDiaria(desde: string, hasta: string, filtros: FiltrosTablero) {
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`"fechaOperacion" >= ${desde}::date`,
      Prisma.sql`"fechaOperacion" <= ${hasta}::date`,
      Prisma.sql`"estado" <> 'CANCELADO'`,
    ];
    if (filtros.clienteId) condiciones.push(Prisma.sql`"clienteId" = ${filtros.clienteId}`);
    if (filtros.vendedorId) condiciones.push(Prisma.sql`"vendedorId" = ${filtros.vendedorId}`);

    const filas = await this.prisma.$queryRaw<FilaVentaDiaria[]>(Prisma.sql`
      SELECT "fechaOperacion" AS dia,
             COALESCE(SUM("total"), 0) AS ventas,
             COUNT(*) AS pedidos
      FROM "pedidos"
      WHERE ${Prisma.join(condiciones, " AND ")}
      GROUP BY "fechaOperacion"
      ORDER BY "fechaOperacion" ASC
    `);

    // Rellenar los días sin ventas: un gráfico con huecos se lee mal y el
    // frontend no debería tener que adivinar qué días faltaron.
    const mapa = new Map(filas.map((f) => [this.aISO(new Date(f.dia)), f]));
    const serie: Array<{ dia: string; ventas: number; pedidos: number }> = [];
    const fin = new Date(`${hasta}T00:00:00Z`).getTime();
    for (let f = new Date(`${desde}T00:00:00Z`); f.getTime() <= fin; f.setUTCDate(f.getUTCDate() + 1)) {
      const dia = this.aISO(f);
      const fila = mapa.get(dia);
      serie.push({ dia, ventas: fila ? Number(fila.ventas) : 0, pedidos: fila ? Number(fila.pedidos) : 0 });
    }
    return serie;
  }

  private async ventasPorMetodo(where: Prisma.PedidoWhereInput) {
    const grupos = await this.prisma.pedido.groupBy({
      by: ["metodo"],
      where,
      _sum: { total: true },
      _count: { _all: true },
    });
    return grupos.map((g) => ({
      metodo: g.metodo,
      ventas: numero(g._sum.total ?? 0),
      pedidos: g._count._all,
    }));
  }

  private async topProductos(desde: string, hasta: string, filtros: FiltrosTablero) {
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`p."fechaOperacion" >= ${desde}::date`,
      Prisma.sql`p."fechaOperacion" <= ${hasta}::date`,
      Prisma.sql`p."estado" <> 'CANCELADO'`,
    ];
    if (filtros.clienteId) condiciones.push(Prisma.sql`p."clienteId" = ${filtros.clienteId}`);
    if (filtros.vendedorId) condiciones.push(Prisma.sql`p."vendedorId" = ${filtros.vendedorId}`);

    const filas = await this.prisma.$queryRaw<
      Array<{
        productoId: string;
        nombre: string;
        unidades: number | bigint;
        venta: number | bigint;
        ganancia: number | bigint;
      }>
    >(Prisma.sql`
      SELECT l."productoId",
             MAX(l."nombre") AS nombre,
             SUM(l."cantidad") AS unidades,
             SUM(l."subtotal") AS venta,
             SUM((l."precioUnitario" - l."costoUnitario") * l."cantidad") AS ganancia
      FROM "pedidoLineas" l
      JOIN "pedidos" p ON p."id" = l."pedidoId"
      WHERE ${Prisma.join(condiciones, " AND ")}
      GROUP BY l."productoId"
      ORDER BY venta DESC
      LIMIT 5
    `);

    return filas.map((f) => ({
      productoId: f.productoId,
      nombre: f.nombre,
      unidades: Number(f.unidades),
      venta: Number(f.venta),
      ganancia: Math.round(Number(f.ganancia) * 100) / 100,
    }));
  }

  private async topClientes(desde: string, hasta: string, filtros: FiltrosTablero) {
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`p."fechaOperacion" >= ${desde}::date`,
      Prisma.sql`p."fechaOperacion" <= ${hasta}::date`,
      Prisma.sql`p."estado" <> 'CANCELADO'`,
    ];
    if (filtros.vendedorId) condiciones.push(Prisma.sql`p."vendedorId" = ${filtros.vendedorId}`);

    const filas = await this.prisma.$queryRaw<
      Array<{ clienteId: string; nombre: string; comprado: number | bigint; pedidos: number | bigint }>
    >(Prisma.sql`
      SELECT p."clienteId",
             MAX(c."nombre") AS nombre,
             SUM(p."total")  AS comprado,
             COUNT(*)        AS pedidos
      FROM "pedidos" p
      JOIN "clientes" c ON c."id" = p."clienteId"
      WHERE ${Prisma.join(condiciones, " AND ")}
      GROUP BY p."clienteId"
      ORDER BY comprado DESC
      LIMIT 5
    `);

    return filas.map((f) => ({
      clienteId: f.clienteId,
      nombre: f.nombre,
      comprado: Number(f.comprado),
      pedidos: Number(f.pedidos),
    }));
  }

  /**
   * Suma de lo que queda por cobrar.
   * Se descuenta lo efectivamente aplicado a cada pedido para que el número
   * coincida con el que ve el vendedor en la cartera, no con el total bruto.
   */
  private async creditoPendiente(where: Prisma.PedidoWhereInput): Promise<number> {
    const pedidos = await this.prisma.pedido.findMany({
      where: { ...where, metodo: MetodoPago.CREDITO },
      select: { id: true, total: true },
    });
    // aplicadoPorPedido ya excluye las aplicaciones revertidas, así un
    // abono anulado vuelve a contar como deuda.
    const aplicados = await aplicadoPorPedido(this.prisma, pedidos.map((p) => p.id));

    const total = pedidos.reduce(
      (suma, p) => suma + Math.max(0, numero(p.total) - (aplicados.get(p.id) ?? 0)),
      0,
    );
    return Math.round(total * 100) / 100;
  }
}
