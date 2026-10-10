import { Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { CacheTablero } from "./cache.service";
import { ErrorDominio } from "../common/errores";
import { Prisma, EstadoPedido, MetodoPago } from "@prisma/client";
import { PrismaService } from "../common/prisma.module";
import { numero } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";

/** Filtros del tablero. Todos son opcionales. */
export interface FiltrosTablero {
  desde?: string;
  hasta?: string;
  clienteId?: string;
  vendedorId?: string;
  /** Días hacia atrás cuando no se indica un rango. */
  dias?: number;
  soloTops?: boolean;
}

type FilaVentaDiaria = { dia: Date; ventas: number | bigint; pedidos: number | bigint };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly cache?: CacheTablero) {}
  private readonly pendientes = new Map<string, Promise<Awaited<ReturnType<DashboardService["calcular"]>> & { cache: { estado: string; version: string } }>>();

  async resumen(filtros: FiltrosTablero = {}) {
    const normalizados = { ...filtros, ...this.rango(filtros) };
    if (normalizados.desde > normalizados.hasta || (!normalizados.soloTops && (Date.parse(normalizados.hasta) - Date.parse(normalizados.desde)) / 86400000 > 2000)) throw new ErrorDominio("RANGO_INVALIDO", "Selecciona un rango de hasta 2000 días", 400);
    const hash = createHash("sha256").update(JSON.stringify([normalizados.desde, normalizados.hasta, normalizados.clienteId ?? null, normalizados.vendedorId ?? null, !!normalizados.soloTops])).digest("hex");
    const revision = await this.version();
    const clave = `v2:${revision}:${hash}`;
    const previo = await this.cache?.obtener<Awaited<ReturnType<DashboardService["calcular"]>>>(clave);
    if (previo) return { ...previo, cache: { estado: "hit", version: revision } };
    const pendiente = this.pendientes.get(clave);
    if (pendiente) return pendiente;
    const calculo = this.prisma.$transaction(async (tx) => {
      const servicio = new DashboardService(tx as PrismaService);
      const version = await servicio.version();
      const data = await servicio.calcular(normalizados);
      return { data, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 }).then(async ({ data, version }) => {
      await this.cache?.guardar(`v2:${version}:${hash}`, data);
      return { ...data, cache: { estado: "miss", version } };
    }).finally(() => this.pendientes.delete(clave));
    this.pendientes.set(clave, calculo);
    return calculo;
  }

  private async version() {
    const [fila] = await this.prisma.$queryRaw<Array<{ version: bigint }>>`SELECT version FROM "versionesCache" WHERE id = 'dashboard'`;
    return fila.version.toString();
  }

  /**
   * Tablero del administrador.
   *
   * Todo se calcula con agregaciones en la base de datos. Antes se cargaban
   * todos los pedidos con sus líneas para sumarlos en memoria, lo que no
   * escalaba: con dos años de historial la consulta se caía.
   */
  private async calcular(filtros: FiltrosTablero = {}) {
    const { desde, hasta } = this.rango(filtros);
    const where = this.filtroPedidos(desde, hasta, filtros);

    const [agregado, alertasStock, credito, gastos, compras] = await Promise.all([
      this.prisma.pedido.aggregate({
        where,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*) AS total FROM productos WHERE activo = true AND ("stockFisico" - "stockReservado") <= "stockMinimo"`,
      this.creditoPendiente(desde, hasta, filtros),
      this.prisma.gasto.aggregate({ where: { fechaOperacion: this.filtroFecha(desde, hasta) }, _sum: { monto: true } }),
      this.prisma.recepcionCompra.aggregate({ where: { fechaOperacion: this.filtroFecha(desde, hasta) }, _sum: { total: true } }),
    ]);

    const [serie, topProductos, topClientes, porMetodo, descuadres] = await Promise.all([
      filtros.soloTops ? Promise.resolve([]) : this.serieDiaria(desde, hasta, filtros),
      this.topProductos(desde, hasta, filtros),
      this.topClientes(desde, hasta, filtros),
      this.ventasPorMetodo(where),
      filtros.soloTops ? Promise.resolve({ faltantes: 0, sobrantes: 0, neto: 0, lineasSinCosto: 0, serie: [] }) : this.descuadres(desde, hasta),
    ]);

    const ventas = numero(agregado._sum?.total ?? 0);
    const pedidos = agregado._count._all;
    const totalCompras = numero(compras._sum?.total ?? 0);
    const condicionesCosto: Prisma.Sql[] = [Prisma.sql`p."fechaOperacion" >= ${desde}::date`, Prisma.sql`p."fechaOperacion" <= ${hasta}::date`, Prisma.sql`p.estado <> 'cancelado'`];
    if (filtros.clienteId) condicionesCosto.push(Prisma.sql`p."clienteId" = ${filtros.clienteId}`);
    if (filtros.vendedorId) condicionesCosto.push(Prisma.sql`p."vendedorId" = ${filtros.vendedorId}`);
    const [costos] = await this.prisma.$queryRaw<Array<{ costo: number }>>(Prisma.sql`SELECT COALESCE(SUM(l."costoUnitario" * l.cantidad), 0)::float8 AS costo FROM "pedidoLineas" l JOIN pedidos p ON p.id = l."pedidoId" WHERE ${Prisma.join(condicionesCosto, " AND ")}`);

    return {
      rango: { desde, hasta },
      ventas,
      pedidos,
      ticketPromedio: pedidos > 0 ? Math.round((ventas / pedidos) * 100) / 100 : 0,
      gastos: numero(gastos._sum?.monto ?? 0),
      compras: totalCompras,
      descuadres,
      utilidad: Math.round((ventas - Number(costos.costo) - numero(gastos._sum?.monto ?? 0)) * 100) / 100,
      creditoPendiente: credito,
      creditoPendienteGlobal: await this.creditoPendiente("1900-01-01", "9999-12-31", filtros),
      alertasStock: Number(alertasStock[0].total),
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

  private async descuadres(desde: string, hasta: string) {
    const inicio = new Date(`${desde}T00:00:00-05:00`);
    const fin = new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + 86400000);
    const filas = await this.prisma.$queryRaw<Array<{ dia: Date; faltantes: number; sobrantes: number; lineasSinCosto: bigint }>>(Prisma.sql`
      WITH diferencias AS (
        SELECT (c."finalizadoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date AS dia,
          l.diferencia, l."costoUnitarioConteo" AS costo
        FROM "conteosInventario" c JOIN "conteoLineas" l ON l."conteoId" = c.id
        WHERE c.estado = 'confirmado' AND c.tipo <> 'inicial' AND l."stockFisico" IS NOT NULL
          AND l.diferencia <> 0 AND c."finalizadoEn" >= ${inicio} AND c."finalizadoEn" < ${fin}
        UNION ALL
        SELECT (a."creadoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date,
          l.diferencia, l."costoUnitario"
        FROM "ajustesInventario" a JOIN "ajusteLineas" l ON l."ajusteInventarioId" = a.id
        WHERE a."conteoId" IS NULL AND a.estado = 'aplicado' AND l.diferencia <> 0
          AND a."creadoEn" >= ${inicio} AND a."creadoEn" < ${fin}
      )
      SELECT dia, COALESCE(SUM(GREATEST(-diferencia, 0) * costo), 0)::float8 AS faltantes,
        COALESCE(SUM(GREATEST(diferencia, 0) * costo), 0)::float8 AS sobrantes,
        COUNT(*) FILTER (WHERE costo IS NULL) AS "lineasSinCosto"
      FROM diferencias GROUP BY dia ORDER BY dia
    `);
    const serie = filas.map(f => ({ dia: this.aISO(f.dia), faltantes: Number(f.faltantes), sobrantes: Number(f.sobrantes), lineasSinCosto: Number(f.lineasSinCosto) }));
    const faltantes = Math.round(serie.reduce((s, f) => s + f.faltantes, 0) * 100) / 100;
    const sobrantes = Math.round(serie.reduce((s, f) => s + f.sobrantes, 0) * 100) / 100;
    return { faltantes, sobrantes, neto: Math.round((sobrantes - faltantes) * 100) / 100, lineasSinCosto: serie.reduce((s, f) => s + f.lineasSinCosto, 0), serie };
  }

  /**
   * Ventas agrupadas por día.
   * Va en SQL directo porque Prisma no agrupa por día (una fecha) sin traer
   * cada fila a memoria.
   */
  private async serieDiaria(desde: string, hasta: string, filtros: FiltrosTablero) {
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`"fechaOperacion" >= ${desde}::date`,
      Prisma.sql`"fechaOperacion" <= ${hasta}::date`,
      // En SQL crudo hay que usar el valor de la base (`cancelado`, el @map del
      // enum), no el nombre del enum del cliente (`EstadoPedido.CANCELADO`).
      Prisma.sql`"estado" <> 'cancelado'`,
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
    const [egresos, costos] = await Promise.all([
      this.prisma.$queryRaw<Array<{ dia: Date; gastos: number; compras: number }>>(Prisma.sql`
        SELECT dia, SUM(gastos)::float8 AS gastos, SUM(compras)::float8 AS compras FROM (
          SELECT "fechaOperacion" AS dia, monto AS gastos, 0 AS compras FROM gastos WHERE "fechaOperacion" BETWEEN ${desde}::date AND ${hasta}::date
          UNION ALL SELECT "fechaOperacion", 0, total FROM "recepcionesCompra" WHERE "fechaOperacion" BETWEEN ${desde}::date AND ${hasta}::date
        ) e GROUP BY dia`),
      this.prisma.$queryRaw<Array<{ dia: Date; costo: number }>>(Prisma.sql`
        SELECT p."fechaOperacion" AS dia, SUM(l."costoUnitario" * l.cantidad)::float8 AS costo
        FROM pedidos p JOIN "pedidoLineas" l ON l."pedidoId" = p.id
        WHERE p."fechaOperacion" BETWEEN ${desde}::date AND ${hasta}::date AND p.estado <> 'cancelado'
        ${filtros.clienteId ? Prisma.sql`AND p."clienteId" = ${filtros.clienteId}` : Prisma.empty}
        ${filtros.vendedorId ? Prisma.sql`AND p."vendedorId" = ${filtros.vendedorId}` : Prisma.empty}
        GROUP BY p."fechaOperacion"`),
    ]);
    const mapaEgresos = new Map(egresos.map((f) => [this.aISO(f.dia), f]));
    const mapaCostos = new Map(costos.map((f) => [this.aISO(f.dia), f.costo]));
    const serie: Array<{ dia: string; ventas: number; pedidos: number; gastos: number; compras: number; costo: number }> = [];
    const fin = new Date(`${hasta}T00:00:00Z`).getTime();
    for (let f = new Date(`${desde}T00:00:00Z`); f.getTime() <= fin; f.setUTCDate(f.getUTCDate() + 1)) {
      const dia = this.aISO(f);
      const fila = mapa.get(dia);
      serie.push({ dia, ventas: fila ? Number(fila.ventas) : 0, pedidos: fila ? Number(fila.pedidos) : 0, gastos: Number(mapaEgresos.get(dia)?.gastos ?? 0), compras: Number(mapaEgresos.get(dia)?.compras ?? 0), costo: Number(mapaCostos.get(dia) ?? 0) });
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
      Prisma.sql`p."estado" <> 'cancelado'`,
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
      Prisma.sql`p."estado" <> 'cancelado'`,
    ];
    if (filtros.vendedorId) condiciones.push(Prisma.sql`p."vendedorId" = ${filtros.vendedorId}`);

    const filas = await this.prisma.$queryRaw<
      Array<{ clienteId: string; nombre: string; comprado: number | bigint; pedidos: number | bigint; ganancia: number }>
    >(Prisma.sql`
      SELECT p."clienteId",
             MAX(c."nombre") AS nombre,
             SUM(p."total")  AS comprado,
             COUNT(*)        AS pedidos,
             SUM(p.total - COALESCE(costo.total, 0))::float8 AS ganancia
      FROM "pedidos" p
      JOIN "clientes" c ON c."id" = p."clienteId"
      LEFT JOIN LATERAL (SELECT SUM(l."costoUnitario" * l.cantidad) AS total FROM "pedidoLineas" l WHERE l."pedidoId" = p.id) costo ON true
      WHERE ${Prisma.join(condiciones, " AND ")}
      GROUP BY p."clienteId"
      ORDER BY comprado DESC
      LIMIT 5
    `);

    return filas.map((f) => ({
      clienteId: f.clienteId,
      nombre: f.nombre,
      comprado: Number(f.comprado),
      ganancia: Math.round(Number(f.ganancia) * 100) / 100,
      pedidos: Number(f.pedidos),
    }));
  }

  /**
   * Suma de lo que queda por cobrar.
   * Se descuenta lo efectivamente aplicado a cada pedido para que el número
   * coincida con el que ve el vendedor en la cartera, no con el total bruto.
   */
  private async creditoPendiente(desde: string, hasta: string, filtros: FiltrosTablero): Promise<number> {
    const condiciones: Prisma.Sql[] = [Prisma.sql`p.estado <> 'cancelado'`, Prisma.sql`p."fechaOperacion" >= ${desde}::date`, Prisma.sql`p."fechaOperacion" <= ${hasta}::date`];
    if (filtros.clienteId) condiciones.push(Prisma.sql`p."clienteId" = ${filtros.clienteId}`);
    if (filtros.vendedorId) condiciones.push(Prisma.sql`p."vendedorId" = ${filtros.vendedorId}`);
    const [fila] = await this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST(0, p.total - COALESCE(a.aplicado, 0))), 0)::float8 AS total FROM pedidos p
      LEFT JOIN (SELECT pa."pedidoId", SUM(pa."montoAplicado") AS aplicado FROM "pagoAplicaciones" pa JOIN pagos pago ON pago.id = pa."pagoId" WHERE pa."revertidoEn" IS NULL AND pago.estado = 'activo' GROUP BY pa."pedidoId") a ON a."pedidoId" = p.id
      WHERE ${Prisma.join(condiciones, " AND ")}`);
    return Math.round(Number(fila.total) * 100) / 100;
  }
}
