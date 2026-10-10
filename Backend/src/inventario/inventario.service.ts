import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { seleccionarConteoDiario, IniciarConteoEsquema, type InventarioInicialDTO } from "@ambie/contrato";
import { numero } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { EstadoConteo, TipoConteo, TipoMovimientoInventario, RolUsuario, Prisma } from "@prisma/client";

const IniciarConteoSchema = IniciarConteoEsquema;

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async iniciarCompartido(tipo: "inicial" | "general" | "aleatorio", usuarioId: string) {
    return this.prisma.enTransaccion(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventario:${tipo}`}))`;
      const abierto = await tx.conteoInventario.findFirst({ where: { tipo: tipo === "inicial" ? TipoConteo.INICIAL : tipo === "general" ? TipoConteo.GENERAL : TipoConteo.ALEATORIO, estado: tipo === "inicial" ? { not: EstadoConteo.CANCELADO } : EstadoConteo.EN_CURSO }, orderBy: { iniciadoEn: "asc" }, select: { id: true } });
      return abierto ?? { id: (await this.iniciarConteo({ tipo, turno: "Conteo compartido" }, usuarioId)).id };
    });
  }

  async asignar(conteoId: string, usuarioId: string, liberar = false) {
    return this.prisma.$transaction(async tx => {
      if (liberar) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conteo:${conteoId}`}))`;
        await tx.conteoLinea.updateMany({ where: { conteoId, asignadoPorId: usuarioId }, data: { asignadoPorId: null, asignadoHasta: null } });
        return null;
      }
      await this.validarEnCurso(conteoId, tx);
      const ahora = new Date();
      const propia = await tx.conteoLinea.findFirst({ where: { conteoId, stockFisico: null, asignadoPorId: usuarioId, asignadoHasta: { gt: ahora } }, orderBy: { id: "asc" } });
      const siguiente = propia ?? await tx.conteoLinea.findFirst({ where: { conteoId, stockFisico: null, OR: [{ asignadoPorId: null }, { asignadoHasta: { lte: ahora } }, { asignadoPor: { activo: false } }] }, orderBy: { producto: { nombre: "asc" } } });
      if (!siguiente) return null;
      const linea = await tx.conteoLinea.update({ where: { id: siguiente.id }, data: { asignadoPorId: usuarioId, asignadoHasta: new Date(ahora.getTime() + 5 * 60_000) }, include: { producto: true } });
      return { productoId: linea.productoId, nombre: linea.producto.nombre, codigo: linea.producto.codigoInterno, unidad: linea.producto.unidad, asignadoHasta: linea.asignadoHasta!.toISOString() };
    });
  }

  async resumenes(pagina = 1, porPagina = 30, soloAbiertos = false, administrador = true, conteoId?: string) {
    return this.prisma.$transaction(async tx => {
      const where = Prisma.sql`WHERE TRUE ${soloAbiertos || !administrador ? Prisma.sql`AND c.estado = 'en-curso'` : Prisma.empty} ${conteoId ? Prisma.sql`AND c.id = ${conteoId}` : Prisma.empty}`;
      const [cuenta] = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM "conteosInventario" c ${where}`);
      const total = Number(cuenta.total), actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
      const filas = await tx.$queryRaw<Array<{ id: string; tipo: string; estado: string; iniciadoEn: Date; finalizadoEn: Date | null; total: bigint; contadas: bigint; ocupadas: bigint; colaboradores: bigint; unidades: bigint; faltantes: Prisma.Decimal; sobrantes: Prisma.Decimal; valorContado: Prisma.Decimal; sinCosto: bigint; aplicado: boolean }>>(Prisma.sql`
        SELECT c.id, c.tipo::text, c.estado::text, c."iniciadoEn", c."finalizadoEn", l.*,
          (SELECT COUNT(*) FROM "participantesConteo" pc WHERE pc."conteoId"=c.id) AS colaboradores,
          EXISTS(SELECT 1 FROM "ajustesInventario" a WHERE a."conteoId"=c.id) AS aplicado
        FROM (SELECT * FROM "conteosInventario" c ${where} ORDER BY c."iniciadoEn" DESC,c.id DESC LIMIT ${porPagina} OFFSET ${(actual - 1) * porPagina}) c
        CROSS JOIN LATERAL (SELECT COUNT(*) AS total, COUNT("stockFisico") AS contadas,
          COUNT(*) FILTER(WHERE "stockFisico" IS NULL AND "asignadoHasta">CURRENT_TIMESTAMP) AS ocupadas,
          COALESCE(SUM("stockFisico"),0) AS unidades,
          COALESCE(SUM(GREATEST(-diferencia,0)*"costoUnitarioConteo"),0) AS faltantes,
          COALESCE(SUM(GREATEST(diferencia,0)*"costoUnitarioConteo"),0) AS sobrantes,
          COALESCE(SUM("stockFisico"*"costoUnitarioConteo"),0) AS "valorContado",
          COUNT(*) FILTER(WHERE "stockFisico" IS NOT NULL AND "costoUnitarioConteo" IS NULL) AS "sinCosto"
          FROM "conteoLineas" WHERE "conteoId"=c.id) l`);
      return { data: filas.map(f => ({ ...f, iniciadoEn: f.iniciadoEn.toISOString(), finalizadoEn: f.finalizadoEn?.toISOString() ?? null,
        total: Number(f.total), contadas: Number(f.contadas), ocupadas: Number(f.ocupadas), colaboradores: Number(f.colaboradores), unidades: Number(f.unidades),
        faltantes: administrador ? Number(f.faltantes) : 0, sobrantes: administrador ? Number(f.sobrantes) : 0, valorContado: administrador ? Number(f.valorContado) : 0, sinCosto: Number(f.sinCosto) })), meta: { total, pagina: actual, porPagina } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async lineasCompartidas(conteoId: string, pagina: number, porPagina: number, q: string, administrador: boolean) {
    return this.prisma.$transaction(async tx => {
      const conteo = await tx.conteoInventario.findUnique({ where: { id: conteoId }, select: { estado: true } });
      if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
      if (!administrador && conteo.estado !== EstadoConteo.EN_CURSO) throw new ErrorDominio("CONTEO_CERRADO", "El administrador ya cerró este conteo", 403);
      const where: Prisma.ConteoLineaWhereInput = { conteoId, producto: { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { codigoInterno: { contains: q, mode: "insensitive" } }] } };
      const total = await tx.conteoLinea.count({ where });
      const actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
      const filas = await tx.conteoLinea.findMany({ where, orderBy: [{ producto: { nombre: "asc" } }, { id: "asc" }], take: porPagina, skip: (actual - 1) * porPagina,
        include: { producto: { select: { nombre: true, codigoInterno: true, unidad: true } }, contadoPor: { select: { nombre: true } }, asignadoPor: { select: { nombre: true } } } });
      return { data: filas.map(l => ({ productoId: l.productoId, nombre: l.producto.nombre, codigo: l.producto.codigoInterno, unidad: l.producto.unidad,
        stockFisico: l.stockFisico, diferencia: administrador ? l.diferencia : null, contadoEn: l.contadoEn?.toISOString() ?? null, contadoPor: l.contadoPor?.nombre ?? null,
        asignadoPorId: l.asignadoHasta && l.asignadoHasta > new Date() ? l.asignadoPorId : null,
        asignadoPor: l.asignadoHasta && l.asignadoHasta > new Date() ? l.asignadoPor?.nombre ?? null : null, asignadoHasta: l.asignadoHasta?.toISOString() ?? null })), meta: { total, pagina: actual, porPagina } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async iniciarConteo(datos: z.infer<typeof IniciarConteoSchema>, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const fechaDiaria = datos.tipo === "aleatorio" ? hoyLocal() : null;
      if (fechaDiaria) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:diario'))`;
        const existente = await tx.conteoInventario.findFirst({ where: { fechaDiaria, estado: { not: EstadoConteo.CANCELADO } }, include: { usuario: {select:{nombre:true}}, lineas: { include: { producto: true } }, ajustes: { select: { id: true } } } });
        if (existente) return this.dtoConteo(existente);
        const pendiente = await tx.conteoInventario.findFirst({ where: { tipo: TipoConteo.ALEATORIO, fechaDiaria: { not: null }, estado: EstadoConteo.EN_CURSO }, include: { usuario: {select:{nombre:true}}, lineas: { include: { producto: true } }, ajustes: { select: { id: true } } } });
        if (pendiente) return this.dtoConteo(pendiente);
      }
      if (datos.tipo === "inicial") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
        if (await tx.conteoInventario.findFirst({ where: { tipo: TipoConteo.INICIAL, estado: { not: EstadoConteo.CANCELADO } } })) throw new ErrorDominio("INVENTARIO_INICIAL_EXISTENTE", "Ya existe un inventario inicial. Continúa o revisa el registro existente", 409);
      }
      const productos = await tx.producto.findMany({ where: { activo: true }, orderBy: { id: "asc" } });
      if (!productos.length) throw new ErrorDominio("SIN_PRODUCTOS", "Registra productos antes de iniciar el conteo");

      let seleccion = productos;
      const ciclos = new Map<string, number>();
      if (fechaDiaria) {
        const ultima = await tx.conteoLinea.aggregate({ where: { conteo: { estado: EstadoConteo.CONFIRMADO }, cicloDiario: { not: null } }, _max: { cicloDiario: true } });
        const ciclo = ultima._max.cicloDiario ?? 1;
        const cubiertas = await tx.conteoLinea.findMany({ where: { cicloDiario: ciclo, conteo: { estado: EstadoConteo.CONFIRMADO } }, select: { productoId: true } });
        const contados = new Set(cubiertas.map(l => l.productoId));
        const diario = seleccionarConteoDiario(productos, ciclo, contados);
        seleccion = diario.map(l => l.producto);
        for (const linea of diario) ciclos.set(linea.producto.id, linea.ciclo);

      }

      const conteo = await tx.conteoInventario.create({
        data: {
          tipo: datos.tipo === "inicial" ? TipoConteo.INICIAL : datos.tipo === "general" ? TipoConteo.GENERAL : TipoConteo.ALEATORIO,
          usuarioId,
          fechaDiaria,
          turno: datos.turno,
          lineas: {
            create: seleccion.map((p) => ({
              productoId: p.id,
              stockTeorico: p.stockFisico,
              cicloDiario: ciclos.get(p.id) ?? null,
            })),
          },
        },
        include: { usuario: {select:{nombre:true}}, lineas: { include: { producto: true } }, ajustes: { select: { id: true } } },
      });

      return this.dtoConteo(conteo);
    });
  }

  async actualizarLinea(conteoId: string, productoId: string, stockFisico: number, usuarioId: string, devolverDetalle = true, contadoEnEsperado?: string | null) {
    await this.prisma.$transaction(async (tx) => {
      await this.validarEnCurso(conteoId, tx);
      const linea = await tx.conteoLinea.findUnique({
        where: { conteoId_productoId: { conteoId, productoId } },
      });
      if (!linea) throw new ErrorDominio("NO_ENCONTRADO", "Línea de conteo no encontrada", 404);
      if (contadoEnEsperado !== undefined && (linea.contadoEn?.toISOString() ?? null) !== contadoEnEsperado) throw new ErrorDominio("CONTEO_CAMBIO", "La cantidad cambió desde que la abriste. Revisa la lectura actual antes de corregir", 409);
      const ahora = new Date();
      if (linea.asignadoPorId && linea.asignadoPorId !== usuarioId && linea.asignadoHasta && linea.asignadoHasta > ahora) throw new ErrorDominio("PRODUCTO_OCUPADO", "Otro colaborador está contando este producto", 409);
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { rol: true } });
      if (usuario.rol === RolUsuario.INVENTARIO && (linea.stockFisico !== null || linea.asignadoPorId !== usuarioId || !linea.asignadoHasta || linea.asignadoHasta <= ahora)) throw new ErrorDominio("ASIGNACION_VENCIDA", "Solicita un producto disponible antes de guardar. La cantidad anterior se conserva", 409);
      const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId }, select: { costoActual: true } });
      await tx.participacionConteo.upsert({ where: { conteoId_usuarioId: { conteoId, usuarioId } }, create: { conteoId, usuarioId }, update: { ultimoEn: ahora } });

      await tx.conteoLinea.update({
        where: { id: linea.id },
        data: {
          stockFisico,
          diferencia: stockFisico - linea.stockTeorico,
          contadoEn: new Date(),
          contadoPorId: usuarioId,
          costoUnitarioConteo: producto.costoActual,
          asignadoPorId: null, asignadoHasta: null,
        },
      });
    });

    return devolverDetalle ? this.obtener(conteoId) : null;
  }

  async finalizar(conteoId: string) {
    await this.prisma.$transaction(async (tx) => {
      const conteo = await this.validarEnCurso(conteoId, tx);
      if (await tx.conteoLinea.count({ where: { conteoId, asignadoHasta: { gt: new Date() } } })) throw new ErrorDominio("CONTEO_OCUPADO", "Hay colaboradores contando productos. Espera a que guarden o liberen su producto", 409);
      if ((conteo.tipo === TipoConteo.INICIAL || conteo.fechaDiaria) && await tx.conteoLinea.count({ where: { conteoId, stockFisico: null } })) throw new ErrorDominio("CONTEO_INCOMPLETO", "Cuenta todos los productos antes de confirmar este inventario");
      await tx.conteoInventario.update({
        where: { id: conteoId },
        data: { estado: EstadoConteo.CONFIRMADO, finalizadoEn: new Date() },
      });
    });
    return this.obtener(conteoId);
  }

  async cancelar(conteoId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conteo:${conteoId}`}))`;
      const conteo = await tx.conteoInventario.findUnique({ where: { id: conteoId } });
      if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
      const inicialSinAplicar = conteo.tipo === TipoConteo.INICIAL && conteo.estado === EstadoConteo.CONFIRMADO && !await tx.ajusteInventario.findFirst({ where: { conteoId } });
      if (conteo.estado !== EstadoConteo.EN_CURSO && !inicialSinAplicar) throw new ErrorDominio("CONTEO_NO_EN_CURSO", "Este conteo ya está cerrado y no puede cancelarse");
      await tx.conteoInventario.update({
        where: { id: conteoId },
        data: { estado: EstadoConteo.CANCELADO, finalizadoEn: new Date() },
      });
    });
    return this.obtener(conteoId);
  }

  async aplicarAjuste(conteoId: string, usuarioId: string) {
    await this.prisma.$transaction(async (tx) => {
      const tipo = await tx.conteoInventario.findUnique({ where: { id: conteoId }, select: { tipo: true } });
      if (tipo?.tipo === TipoConteo.INICIAL) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conteo:${conteoId}`}))`;
      const conteo = await tx.conteoInventario.findUnique({
        where: { id: conteoId },
        include: { usuario: {select:{nombre:true}}, lineas: { include: { producto: true } }, ajustes: { select: { id: true } } },
      });
      if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
      if (conteo.estado !== EstadoConteo.CONFIRMADO) throw new ErrorDominio("CONTEO_NO_CONFIRMADO", "El conteo debe estar confirmado");

      const yaAjustado = await tx.ajusteInventario.findFirst({ where: { conteoId } });
      if (yaAjustado) throw new ErrorDominio("AJUSTE_DUPLICADO", "Este conteo ya fue aplicado", 409);

      const contadas = conteo.lineas.filter((l) => l.stockFisico !== null);

      const inicial = conteo.tipo === TipoConteo.INICIAL;
      const ids = contadas.map((l) => l.productoId).sort();
      if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      if (inicial) {
        const activos = await tx.producto.findMany({ where: { activo: true }, select: { id: true } });
        if (contadas.length !== conteo.lineas.length || activos.length !== ids.length || activos.some((p) => !ids.includes(p.id))) throw new ErrorDominio("CATALOGO_CAMBIO", "El catálogo cambió o faltan productos por contar. Cancela este inicio y vuelve a contar", 409);
      }
      const ajuste = await tx.ajusteInventario.create({
        data: { conteoId, usuarioId, motivo: inicial ? "Inventario inicial" : "Conteo de inventario" },
      });

      for (const linea of contadas) {
        const producto = await tx.producto.findUniqueOrThrow({ where: { id: linea.productoId } });
        if (inicial && producto.stockFisico !== linea.stockTeorico) throw new ErrorDominio("STOCK_CAMBIO", `El stock de ${producto.nombre} cambió durante el conteo. Cancela este inicio y vuelve a contar`, 409);
        if ((linea.stockFisico as number) < producto.stockReservado) throw new ErrorDominio("STOCK_RESERVADO", "El stock contado no puede ser menor que las reservas pendientes; resuelve los pedidos primero");
        await tx.ajusteLinea.create({
          data: {
            ajusteInventarioId: ajuste.id,
            conteoLineaId: linea.id,
            productoId: linea.productoId,
            stockTeorico: linea.stockTeorico,
            stockFisico: linea.stockFisico as number,
            diferencia: linea.diferencia ?? 0,
            costoUnitario: linea.costoUnitarioConteo,
          },
        });
        await tx.producto.update({
          where: { id: linea.productoId },
          data: { stockFisico: linea.stockFisico as number },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: linea.productoId,
            tipo: inicial ? TipoMovimientoInventario.INICIALIZACION : TipoMovimientoInventario.AJUSTE_CONTEO,
            cantidad: Math.abs((linea.stockFisico as number) - producto.stockFisico),
            deltaStockFisico: (linea.stockFisico as number) - producto.stockFisico,
            stockFisicoAntes: producto.stockFisico,
            stockFisicoDespues: linea.stockFisico as number,
            stockReservadoAntes: producto.stockReservado,
            stockReservadoDespues: producto.stockReservado,
            conteoId,
            ajusteInventarioId: ajuste.id,
            usuarioId,
          },
        });
        if (inicial) {
          const acumulado = await tx.movimientoInventario.aggregate({ where: { productoId: producto.id }, _sum: { deltaStockFisico: true } });
          await tx.conteoLinea.update({ where: { id: linea.id }, data: { nombreInicial: producto.nombre, costoUnitarioInicial: producto.costoActual, deltaAcumuladoInicial: BigInt(acumulado._sum.deltaStockFisico ?? 0) } });
        }
      }
    });

    return this.obtener(conteoId);
  }

  async ajusteManual(productoId: string, stockFisico: number, motivo: string, comentario: string | undefined, usuarioId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM productos WHERE id = ${productoId} FOR UPDATE`;
      const producto = await tx.producto.findUnique({ where: { id: productoId } });
      if (!producto) throw new ErrorDominio("NO_ENCONTRADO", "Producto no encontrado", 404);
      if (stockFisico < producto.stockReservado) throw new ErrorDominio("STOCK_RESERVADO", "El stock físico no puede ser menor que las reservas pendientes");
      const ajuste = await tx.ajusteInventario.create({
        data: { conteoId: null, usuarioId, motivo, comentario },
      });
      await tx.ajusteLinea.create({
        data: {
          ajusteInventarioId: ajuste.id,
          productoId,
          stockTeorico: producto.stockFisico,
          stockFisico,
          diferencia: stockFisico - producto.stockFisico,
          costoUnitario: producto.costoActual,
        },
      });
      await tx.producto.update({
        where: { id: productoId },
        data: { stockFisico },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId,
          tipo: TipoMovimientoInventario.AJUSTE_MANUAL,
          cantidad: Math.abs(stockFisico - producto.stockFisico),
          deltaStockFisico: stockFisico - producto.stockFisico,
          stockFisicoAntes: producto.stockFisico,
          stockFisicoDespues: stockFisico,
          stockReservadoAntes: producto.stockReservado,
          stockReservadoDespues: producto.stockReservado,
          ajusteInventarioId: ajuste.id,
          motivo,
          comentario,
          usuarioId,
        },
      });
    });

    return { productoId, stockFisico, motivo };
  }

  async listarConteos(pagina = 1, porPagina = 20, actuales = false) {
    const where: Prisma.ConteoInventarioWhereInput = actuales ? { OR: [{ estado: EstadoConteo.EN_CURSO }, { tipo: TipoConteo.INICIAL }] } : {};
    const total = await this.prisma.conteoInventario.count({ where });
    const actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
    const conteos = await this.prisma.conteoInventario.findMany({
      where, orderBy: [{ iniciadoEn: "desc" }, { id: "desc" }], skip: (actual - 1) * porPagina, take: porPagina,
      include: { usuario: {select:{nombre:true}}, lineas: { include: { producto: true } }, ajustes: { select: { id: true } } },
    });
    return { data: conteos.map((c) => this.dtoConteo(c)), meta: { total, pagina: actual, porPagina } };
  }

  async inicial(pagina = 1, busqueda = "", porPagina = 30): Promise<InventarioInicialDTO | null> {
    return this.prisma.$transaction(async (tx) => {
      const conteo = await tx.conteoInventario.findFirst({ where: { tipo: TipoConteo.INICIAL, estado: EstadoConteo.CONFIRMADO } });
      if (!conteo) return null;
      const ajuste = await tx.ajusteInventario.findFirst({ where: { conteoId: conteo.id } });
      if (!ajuste) return null;
      const filtro = `%${busqueda.trim().slice(0, 100)}%`;
      // El acumulado evita depender del orden de timestamps de transacciones
      // concurrentes: inicial + (ledger actual - ledger al aplicar).
      const base = Prisma.sql`WITH movimientos AS (
        SELECT m."productoId", SUM(m."deltaStockFisico") AS delta
        FROM "movimientosInventario" m JOIN "conteoLineas" l ON l."productoId" = m."productoId" AND l."conteoId" = ${conteo.id}
        GROUP BY m."productoId"
      ), inicial AS (
        SELECT l."productoId", l."nombreInicial" AS nombre, l."costoUnitarioInicial", l."stockFisico" AS "stockInicial", p."stockFisico" AS "stockActual",
          COALESCE(m.delta, 0) - l."deltaAcumuladoInicial" AS "movimientoNeto",
          l."stockFisico" + COALESCE(m.delta, 0) - l."deltaAcumuladoInicial" AS "stockEsperado"
        FROM "conteoLineas" l JOIN productos p ON p.id = l."productoId"
        LEFT JOIN movimientos m ON m."productoId" = l."productoId" WHERE l."conteoId" = ${conteo.id}
      )`;
      const [totales] = await tx.$queryRaw<Array<{ productos: bigint; unidadesIniciales: bigint; valorInicial: Prisma.Decimal; unidadesActuales: bigint; valorActualCostoInicial: Prisma.Decimal; diferencias: bigint; total: bigint }>>(Prisma.sql`${base}
        SELECT COUNT(*) AS productos, COALESCE(SUM("stockInicial"),0) AS "unidadesIniciales", COALESCE(SUM("stockInicial" * "costoUnitarioInicial"),0) AS "valorInicial",
          COALESCE(SUM("stockActual"),0) AS "unidadesActuales", COALESCE(SUM("stockActual" * "costoUnitarioInicial"),0) AS "valorActualCostoInicial",
          COUNT(*) FILTER (WHERE "stockActual" <> "stockEsperado") AS diferencias, COUNT(*) FILTER (WHERE nombre ILIKE ${filtro}) AS total FROM inicial`);
      const actual = Math.min(pagina, Math.max(1, Math.ceil(Number(totales.total) / porPagina)));
      const filas = await tx.$queryRaw<Array<{ productoId: string; nombre: string; costoUnitarioInicial: Prisma.Decimal; stockInicial: number; stockActual: number; movimientoNeto: bigint; stockEsperado: bigint }>>(Prisma.sql`${base}
        SELECT * FROM inicial WHERE nombre ILIKE ${filtro} ORDER BY nombre, "productoId" LIMIT ${porPagina} OFFSET ${(actual - 1) * porPagina}`);
      return { conteoId: conteo.id, aplicadoEn: ajuste.creadoEn.toISOString(), productos: Number(totales.productos), unidadesIniciales: Number(totales.unidadesIniciales), valorInicial: numero(totales.valorInicial), unidadesActuales: Number(totales.unidadesActuales), valorActualCostoInicial: numero(totales.valorActualCostoInicial), diferencias: Number(totales.diferencias), pagina:actual, porPagina, total: Number(totales.total),
        lineas: filas.map((l) => ({ ...l, costoUnitarioInicial: numero(l.costoUnitarioInicial), movimientoNeto: Number(l.movimientoNeto), stockEsperado: Number(l.stockEsperado), diferencia: l.stockActual - Number(l.stockEsperado) })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async listarAjustes(pagina = 1, porPagina = 20, q = "") {
    const where: Prisma.AjusteInventarioWhereInput = q ? { OR: [{ motivo: { contains: q, mode: "insensitive" } }, { comentario: { contains: q, mode: "insensitive" } }, { lineas: { some: { producto: { nombre: { contains: q, mode: "insensitive" } } } } }] } : {};
    const total = await this.prisma.ajusteInventario.count({ where });
    const actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
    const ajustes = await this.prisma.ajusteInventario.findMany({ where, orderBy: [{ creadoEn: "desc" }, { id: "desc" }], skip: (actual - 1) * porPagina, take: porPagina, include: { usuario:{select:{nombre:true}}, lineas: { include: { producto: true } } } });
    return { data: ajustes.map((a) => ({ ...a, usuario:a.usuario.nombre, lineas: a.lineas.map((l) => ({ id: l.id, productoId: l.productoId, nombre: l.producto.nombre, stockTeorico: l.stockTeorico, stockFisico: l.stockFisico, diferencia: l.diferencia, costoUnitario: l.costoUnitario === null ? null : numero(l.costoUnitario) })) })), meta: { total, pagina: actual, porPagina } };
  }

  async listarDescuadres(pagina = 1, porPagina = 20, q = "") {
    const where: Prisma.ConteoLineaWhereInput = { diferencia: { not: 0 }, stockFisico: { not: null }, conteo: { estado: EstadoConteo.CONFIRMADO }, ...(q ? { OR: [{ producto: { nombre: { contains: q, mode: "insensitive" } } }, { conteo: { turno: { contains: q, mode: "insensitive" } } }] } : {}) };
    const total = await this.prisma.conteoLinea.count({ where });
    const pendientes = await this.prisma.conteoLinea.count({where:{...where,conteo:{estado:EstadoConteo.CONFIRMADO,ajustes:{none:{}}}}});
    const actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
    const lineas = await this.prisma.conteoLinea.findMany({ where, skip: (actual - 1) * porPagina, take: porPagina, orderBy: [{ conteo: { finalizadoEn: "desc" } }, { id: "desc" }], include: { producto: true, conteo: { include: { usuario:{select:{nombre:true}}, ajustes: { select: { id: true } } } } } });
    return { data: lineas.map(l => ({ id: l.id, conteoId: l.conteoId, productoId: l.productoId, nombre: l.producto.nombre, stockTeorico: l.stockTeorico, stockFisico: l.stockFisico, diferencia: l.diferencia, turno: l.conteo.turno, usuarioId: l.conteo.usuarioId, usuario:l.conteo.usuario.nombre, finalizadoEn: l.conteo.finalizadoEn, yaAjustado: l.conteo.ajustes.length > 0 })), meta: { total, pendientes, pagina: actual, porPagina } };
  }

  async obtener(conteoId: string) {
    const conteo = await this.prisma.conteoInventario.findUnique({
      where: { id: conteoId },
      include: { usuario: {select:{nombre:true}}, lineas: { include: { producto: true } }, ajustes: { select: { id: true } } },
    });
    if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
    return this.dtoConteo(conteo);
  }

  private async validarEnCurso(conteoId: string, tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conteo:${conteoId}`}))`;
    const conteo = await tx.conteoInventario.findUnique({ where: { id: conteoId } });
    if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
    if (conteo.estado !== EstadoConteo.EN_CURSO) throw new ErrorDominio("CONTEO_NO_EN_CURSO", "El conteo no está en curso");
    return conteo;
  }

  private dtoConteo(c: {
    id: string;
    tipo: TipoConteo;
    usuarioId: string;
    usuario?: {nombre:string};
    turno: string;
    iniciadoEn: Date;
    finalizadoEn: Date | null;
    estado: EstadoConteo;
    fechaDiaria: Date | null;
    ajustes?: Array<{ id: string }>;
    lineas: Array<{
      id: string;
      productoId: string;
      stockTeorico: number;
      stockFisico: number | null;
      diferencia: number | null;
      contadoEn: Date | null;
      contadoPorId: string | null;
      costoUnitarioConteo: Prisma.Decimal | null;
      cicloDiario: number | null;
      producto?: { nombre: string };
      nombreInicial: string | null;
      costoUnitarioInicial: Prisma.Decimal | null;
    }>;
  }) {
    const contadas = c.lineas.filter((l) => l.stockFisico !== null);
    return {
      id: c.id,
      tipo: c.tipo.toLowerCase(),
      usuarioId: c.usuarioId,
      usuario: c.usuario?.nombre,
      turno: c.turno,
      iniciadoEn: c.iniciadoEn,
      finalizadoEn: c.finalizadoEn,
      estado: c.estado.toLowerCase().replaceAll("_", "-"),
      fechaDiaria: c.fechaDiaria?.toISOString().slice(0, 10) ?? null,
      aplicado: (c.ajustes?.length ?? 0) > 0,
      // Mantener el producto del paso actual al guardar y volver a leer el conteo.
      lineas: [...c.lineas].sort((a, b) => a.id.localeCompare(b.id)).map((l) => ({
        id: l.id,
        conteoId: c.id,
        productoId: l.productoId,
        nombre: l.producto?.nombre ?? l.nombreInicial ?? "Producto",
        stockTeorico: l.stockTeorico,
        stockFisico: l.stockFisico,
        diferencia: l.diferencia,
        contadoEn: l.contadoEn?.toISOString() ?? null,
        contadoPorId: l.contadoPorId,
        costoUnitarioConteo: l.costoUnitarioConteo === null ? null : numero(l.costoUnitarioConteo),
        cicloDiario: l.cicloDiario,
        nombreInicial: l.nombreInicial,
        costoUnitarioInicial: l.costoUnitarioInicial === null ? null : numero(l.costoUnitarioInicial),
      })),
      resumen: {
        contadas: contadas.length,
        sobrantes: contadas.filter((l) => (l.diferencia ?? 0) > 0).length,
        faltantes: contadas.filter((l) => (l.diferencia ?? 0) < 0).length,
        totalDiferencia: contadas.reduce((s, l) => s + (l.diferencia ?? 0), 0),
      },
    };
  }
}
