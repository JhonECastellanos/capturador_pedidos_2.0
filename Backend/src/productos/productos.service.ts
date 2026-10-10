import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero } from "../common/consecutivos";
import { Prisma } from "@prisma/client";
import type { ImportarProductosDTO, ResultadoImportacionProductosDTO } from "@ambie/contrato";
import { InventarioService } from "../inventario/inventario.service";

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
  constructor(private readonly prisma: PrismaService, private readonly inventario: InventarioService) {}

  async importar(datos: ImportarProductosDTO, usuarioId: string): Promise<ResultadoImportacionProductosDTO> {
    return this.prisma.enTransaccion(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
      const inicial = datos.prepararInicial ? await tx.conteoInventario.findFirst({ where: { tipo: "INICIAL", estado: { not: "CANCELADO" } } }) : null;
      if (inicial && inicial.estado !== "EN_CURSO") throw new ErrorDominio("INVENTARIO_INICIAL_CERRADO", "El inventario inicial ya está confirmado. Desmarca Preparar inventario inicial para importar solo el catálogo y los precios", 409);
      const usados = new Set<string>(), cantidades = new Map<string, number>();
      let creados = 0, actualizados = 0;
      for (const [indice, fila] of datos.productos.entries()) {
        const nombre = fila.nombre.replace(/\s+/g, " ").trim();
        const candidatos = fila.codigoInterno
          ? await tx.producto.findMany({ where: { codigoInterno: fila.codigoInterno } })
          : await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM productos WHERE lower(regexp_replace(btrim(nombre), '\\s+', ' ', 'g')) = lower(${nombre})`;
        if (fila.codigoInterno && !candidatos.length) throw new ErrorDominio("CODIGO_DESCONOCIDO", `Fila ${indice + 2}: el código ${fila.codigoInterno} no existe. Deja el código vacío para un producto nuevo`);
        if (candidatos.length > 1) throw new ErrorDominio("PRODUCTO_AMBIGUO", `Fila ${indice + 2}: hay varios productos llamados ${nombre}. Usa su código`);
        const existente = candidatos[0] ? await tx.producto.findUniqueOrThrow({ where: { id: candidatos[0].id } }) : null;
        const clave = existente?.id ?? nombre.toLocaleLowerCase("es-CO");
        if (usados.has(clave)) throw new ErrorDominio("PRODUCTO_REPETIDO", `Fila ${indice + 2}: ${nombre} está repetido en el archivo`);
        usados.add(clave);
        let id: string;
        if (existente) {
          const homonimos = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM productos WHERE id <> ${existente.id} AND lower(regexp_replace(btrim(nombre), '\\s+', ' ', 'g')) = lower(${nombre})`;
          if (nombre !== existente.nombre && homonimos.length) throw new ErrorDominio("PRODUCTO_REPETIDO", `Fila ${indice + 2}: el nombre ${nombre} pertenece a otro producto`);
          await this.actualizarPrecio(existente.id, fila.precioVenta, usuarioId);
          const categoriaId = fila.categoria ? (await tx.categoria.upsert({ where: { nombre: fila.categoria }, update: {}, create: { codigo: `CAT-${fila.categoria.slice(0,8).toUpperCase()}`, nombre: fila.categoria } })).id : undefined;
          await tx.producto.update({ where: { id: existente.id }, data: { nombre, categoriaId, unidad: fila.unidad || undefined, costoActual: fila.costoActual, stockMinimo: fila.stockMinimo, version: { increment: 1 } } });
          id = existente.id; actualizados++;
        } else {
          const producto = await this.crear({ ...fila, nombre });
          id = producto.id; creados++;
        }
        usados.add(id);
        if (fila.stock !== undefined) cantidades.set(id, fila.stock);
      }
      let conteoInicialId: string | null = null;
      if (datos.prepararInicial) {
        conteoInicialId = inicial?.id ?? (await this.inventario.iniciarConteo({ tipo: "inicial", turno: "Carga de productos CSV" }, usuarioId)).id;
        const activos = await tx.producto.findMany({ where: { activo: true }, select: { id: true, stockFisico: true } });
        await tx.conteoLinea.createMany({ data: activos.map(p => ({ conteoId: conteoInicialId!, productoId: p.id, stockTeorico: p.stockFisico })), skipDuplicates: true });
        for (const [id, cantidad] of cantidades) await this.inventario.actualizarLinea(conteoInicialId, id, cantidad, usuarioId, false);
      }
      return { creados, actualizados, conteoInicialId };
    });
  }

  async listar(q?: string, categoria?: string, stockEstado?: string, pagina = 1, porPagina = 20, orden = "reciente", activo = false) {
    const filtro = q ? Prisma.sql`AND (p.nombre ILIKE ${'%'+q+'%'} OR p."codigoInterno" ILIKE ${'%'+q+'%'} OR c.nombre ILIKE ${'%'+q+'%'})` : Prisma.empty;
    const categoriaFiltro = categoria && categoria !== "Todas" ? Prisma.sql`AND c.nombre = ${categoria}` : Prisma.empty;
    const stockFiltro = stockEstado === "alerta" ? Prisma.sql`AND p."stockFisico"-p."stockReservado" <= p."stockMinimo"` : stockEstado === "ok" ? Prisma.sql`AND p."stockFisico"-p."stockReservado" > p."stockMinimo"` : Prisma.empty;
    const base = Prisma.sql`FROM productos p LEFT JOIN categorias c ON c.id = p."categoriaId" WHERE TRUE ${activo ? Prisma.sql`AND p.activo=true` : Prisma.empty} ${filtro} ${categoriaFiltro} ${stockFiltro}`;
    return this.prisma.$transaction(async tx => {
      const [cuenta] = await tx.$queryRaw<Array<{total: bigint}>>(Prisma.sql`SELECT COUNT(*) AS total ${base}`);
      const total = Number(cuenta.total), actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
      const ordenSql = orden === "alertas" ? Prisma.sql`(p."stockFisico"-p."stockReservado" <= p."stockMinimo") DESC, p.nombre, p.id` : orden === "nombre" ? Prisma.sql`p.nombre,p.id` : Prisma.sql`p."creadoEn" DESC, p.id DESC`;
      const ids = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT p.id ${base} ORDER BY ${ordenSql} LIMIT ${porPagina} OFFSET ${(actual-1)*porPagina}`);
      const productos = await tx.producto.findMany({where: {id: {in: ids.map(p=>p.id)}}, include: {categoria:true}});
      const fotos = await tx.archivoAdjunto.findMany({where: {productoId: {in: ids.map(p=>p.id)}, eliminadoEn:null}, orderBy: {creadoEn:"desc"}, select:{id:true,productoId:true}});
      const [alertas] = await tx.$queryRaw<Array<{total:bigint}>>`SELECT COUNT(*) AS total FROM productos WHERE "stockFisico"-"stockReservado" <= "stockMinimo"`;
      const porId = new Map(productos.map(p=>[p.id,p]));
      return {data: ids.map(({id}) => ({...this.dto(porId.get(id)!), imagenUrl: fotos.find(f=>f.productoId===id) ? '/api/v1/archivos/'+fotos.find(f=>f.productoId===id)!.id : undefined})), meta:{pagina:actual,porPagina,total,alertas:Number(alertas.total)}};
    }, {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
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
      const iguales = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM productos WHERE lower(regexp_replace(btrim(nombre), '\\s+', ' ', 'g')) = lower(${datos.nombre.trim().replace(/\s+/g, " ")})`;
      if (iguales.length) throw new ErrorDominio("PRODUCTO_EXISTENTE", "Ya existe un producto con ese nombre. Usa su código para actualizarlo", 409);
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
        usuarioId: c.usuarioId,
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
