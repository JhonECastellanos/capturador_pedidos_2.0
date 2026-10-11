import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero } from "../common/consecutivos";
import { Prisma, RolUsuario } from "@prisma/client";
import { NuevoProductoEsquema, type ImportarProductosDTO, type ResultadoImportacionProductosDTO } from "@synchronic-jo/contrato";
import { InventarioService } from "../inventario/inventario.service";

export const NuevoProductoSchema = NuevoProductoEsquema;

const nombrePrincipal = (p: { nombre: string; extension: string }) => p.extension && p.nombre.endsWith(` · ${p.extension}`) ? p.nombre.slice(0, -(p.extension.length + 3)) : p.nombre;

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
          const parametrizado = await this.actualizarPrecio(existente.id, fila.precioVenta, usuarioId, { nombre });
          const categoriaId = fila.categoria ? (await tx.categoria.upsert({ where: { nombre: fila.categoria }, update: {}, create: { codigo: `CAT-${fila.categoria.slice(0,8).toUpperCase()}`, nombre: fila.categoria } })).id : undefined;
          await tx.producto.update({ where: { id: existente.id }, data: { nombre: parametrizado.nombre, categoriaId, unidad: fila.unidad || undefined, costoActual: fila.costoActual, stockMinimo: fila.stockMinimo, version: { increment: 1 } } });
          id = existente.id; actualizados++;
        } else {
          const producto = await this.crear(NuevoProductoSchema.parse({ ...fila, nombre }));
          id = producto.id; creados++;
        }
        usados.add(id);
        for (const codigo of fila.codigosLectura ?? []) await this.vincularCodigo(id, codigo);
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
    const filtro = q ? Prisma.sql`AND (p.nombre ILIKE ${'%'+q+'%'} OR p."codigoInterno" ILIKE ${'%'+q+'%'} OR EXISTS(SELECT 1 FROM "codigosProducto" cp WHERE cp."productoId"=p.id AND cp."retiradoEn" IS NULL AND cp.codigo ILIKE ${'%'+q+'%'}) OR c.nombre ILIKE ${'%'+q+'%'})` : Prisma.empty;
    const categoriaFiltro = categoria && categoria !== "Todas" ? Prisma.sql`AND c.nombre = ${categoria}` : Prisma.empty;
    const stockFiltro = stockEstado === "alerta" ? Prisma.sql`AND p."stockFisico"-p."stockReservado" <= p."stockMinimo"` : stockEstado === "ok" ? Prisma.sql`AND p."stockFisico"-p."stockReservado" > p."stockMinimo"` : Prisma.empty;
    const base = Prisma.sql`FROM productos p LEFT JOIN categorias c ON c.id = p."categoriaId" WHERE TRUE ${activo ? Prisma.sql`AND p.activo=true` : Prisma.empty} ${filtro} ${categoriaFiltro} ${stockFiltro}`;
    return this.prisma.$transaction(async tx => {
      const [cuenta] = await tx.$queryRaw<Array<{total: bigint}>>(Prisma.sql`SELECT COUNT(*) AS total ${base}`);
      const total = Number(cuenta.total), actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
      const ordenSql = orden === "alertas" ? Prisma.sql`(p."stockFisico"-p."stockReservado" <= p."stockMinimo") DESC, p.nombre, p.id` : orden === "nombre" ? Prisma.sql`p.nombre,p.id` : Prisma.sql`p."creadoEn" DESC, p.id DESC`;
      const ids = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT p.id ${base} ORDER BY ${ordenSql} LIMIT ${porPagina} OFFSET ${(actual-1)*porPagina}`);
      const productos = await tx.producto.findMany({where: {id: {in: ids.map(p=>p.id)}}, include: {categoria:true,codigosLectura: {where:{retiradoEn:null},select:{codigo:true}}}});
      const fotos = await tx.archivoAdjunto.findMany({where: {productoId: {in: ids.map(p=>p.id)}, eliminadoEn:null}, orderBy: {creadoEn:"desc"}, select:{id:true,productoId:true}});
      const [alertas] = await tx.$queryRaw<Array<{total:bigint}>>`SELECT COUNT(*) AS total FROM productos WHERE "stockFisico"-"stockReservado" <= "stockMinimo"`;
      const porId = new Map(productos.map(p=>[p.id,p]));
      return {data: ids.map(({id}) => ({...this.dto(porId.get(id)!), imagenUrl: fotos.find(f=>f.productoId===id) ? '/api/v1/archivos/'+fotos.find(f=>f.productoId===id)!.id : undefined})), meta:{pagina:actual,porPagina,total,alertas:Number(alertas.total)}};
    }, {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async obtener(productoId: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      include: { categoria: true, codigosLectura: { where: { retiradoEn: null }, select: { codigo: true } } },
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

  async crear(datos: z.infer<typeof NuevoProductoSchema>, precioPendiente = false) {
    const producto = await this.prisma.enTransaccion(async (tx) => {
      // La creación y el punto de partida comparten el mismo candado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
      const base = datos.productoBaseId ? await tx.producto.findUnique({ where: { id: datos.productoBaseId } }) : null;
      const extension = datos.extension?.trim().replace(/\s+/g, " ") ?? "";
      if (datos.productoBaseId && (!base || base.productoBaseId || !base.activo || !extension)) throw new ErrorDominio("PRESENTACION_INVALIDA", "Elige un producto principal activo y escribe su presentación", 409);
      const principal = base ? nombrePrincipal(base) : datos.nombre.trim().replace(/\s+/g, " ");
      const nombre = extension ? `${principal} · ${extension}` : principal;
      const categoria = datos.categoria ? await tx.categoria.upsert({ where: { nombre: datos.categoria }, update: {}, create: { codigo: `CAT-${datos.categoria.slice(0,8).toUpperCase()}`, nombre: datos.categoria } }) : null;
      const total = await tx.producto.count();
      const iguales = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM productos WHERE lower(regexp_replace(btrim(nombre), '\\s+', ' ', 'g')) = lower(${nombre})`;
      if (iguales.length) throw new ErrorDominio("PRODUCTO_EXISTENTE", "Ya existe un producto con ese nombre. Usa su código para actualizarlo", 409);
      const codigoInterno = await siguienteCodigo(tx, "PROD");
      const creado = await tx.producto.create({
        data: {
          codigoInterno,
          nombre, productoBaseId: base?.id, extension,
          categoriaId: categoria?.id ?? base?.categoriaId ?? null,
          unidad: datos.unidad?.trim() || "unidad",
          precioVenta: datos.precioVenta,
          precioPendiente,
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
      const inicialAbierto = await tx.conteoInventario.findFirst({ where: { tipo: "INICIAL", estado: "EN_CURSO" }, select: { id: true } });
      if (inicialAbierto) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conteo:${inicialAbierto.id}`}))`;
        const vigente = await tx.conteoInventario.findUnique({ where: { id: inicialAbierto.id }, select: { estado: true } });
        if (vigente?.estado === "EN_CURSO") await tx.conteoLinea.create({ data: { conteoId: inicialAbierto.id, productoId: creado.id, stockTeorico: creado.stockFisico } });
      }
      for (const codigo of datos.codigosLectura ?? []) await this.vincularCodigo(creado.id, codigo);
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

  async actualizarPrecio(productoId: string, nuevoPrecio: number, usuarioId: string, parametros?: { costoActual?: number; stockMinimo?: number; nombre?: string; extension?: string }) {
    await this.prisma.enTransaccion(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
      const producto = await tx.producto.findUnique({ where: { id: productoId } });
      if (!producto) throw new ErrorDominio("NO_ENCONTRADO", "Producto no encontrado", 404);
      const base = producto.productoBaseId ? await tx.producto.findUniqueOrThrow({ where: { id: producto.productoBaseId } }) : null;
      const extension = parametros?.extension?.trim().replace(/\s+/g, " ") ?? producto.extension;
      if (base && !extension) throw new ErrorDominio("PRESENTACION_INVALIDA", "La presentación necesita un producto principal y un nombre");
      const principal = base ? nombrePrincipal(base) : nombrePrincipal({ nombre: (parametros?.nombre ?? producto.nombre).trim().replace(/\s+/g, " "), extension: producto.extension });
      const nombre = extension ? `${principal} · ${extension}` : principal;
      if (base && parametros?.nombre && parametros.nombre.trim() !== producto.nombre && parametros.nombre.trim() !== nombre) throw new ErrorDominio("NOMBRE_PRESENTACION", "Cambia el nombre desde el producto principal; aquí puedes editar la presentación");
      const repetido = await tx.producto.findFirst({ where: { id: { not: productoId }, nombre: { equals: nombre, mode: "insensitive" } } });
      if (repetido) throw new ErrorDominio("PRODUCTO_EXISTENTE", "Ya existe este producto o presentación", 409);
      const hijos = !base && nombre !== producto.nombre ? await tx.producto.findMany({ where: { productoBaseId: producto.id } }) : [];
      for (const hijo of hijos) {
        const nuevoNombre = `${principal} · ${hijo.extension}`;
        if (await tx.producto.findFirst({ where: { id: { not: hijo.id }, nombre: { equals: nuevoNombre, mode: "insensitive" } } })) throw new ErrorDominio("PRODUCTO_EXISTENTE", "El cambio coincide con otro producto; revisa sus presentaciones", 409);
        await tx.producto.update({ where: { id: hijo.id }, data: { nombre: nuevoNombre, version: { increment: 1 } } });
      }
      if (numero(producto.precioVenta) !== nuevoPrecio || producto.precioPendiente) await tx.cambioPrecio.create({ data: { productoId, valorAnterior: producto.precioVenta, valorNuevo: nuevoPrecio, usuarioId } });
      await tx.producto.update({ where: { id: productoId }, data: { nombre, extension, precioVenta: nuevoPrecio, precioPendiente: false, costoActual: parametros?.costoActual, stockMinimo: parametros?.stockMinimo, version: { increment: 1 } } });
      if (nombre !== producto.nombre || extension !== producto.extension) await tx.auditoriaEvento.create({ data: { entidadTipo: "producto", entidadId: productoId, accion: "editar-producto", usuarioId, datosAntes: { nombre: producto.nombre, extension: producto.extension }, datosDespues: { nombre, extension } } });
    });
    return this.obtener(productoId);
  }

  async resolverCodigo(codigo: string) {
    const externo = await this.prisma.codigoProducto.findUnique({ where: { codigo }, include: { producto: { select: { activo: true } } } });
    if (externo?.retiradoEn) throw new ErrorDominio("CODIGO_RETIRADO", "Este código fue retirado. Busca el producto por nombre", 409);
    const interno = externo ? null : await this.prisma.producto.findUnique({ where: { codigoInterno: codigo }, select: { id: true, activo: true } });
    const id = externo?.productoId ?? interno?.id;
    if (!id) return null;
    if (!(externo?.producto.activo ?? interno?.activo)) throw new ErrorDominio("PRODUCTO_INACTIVO", "Este producto está inactivo", 409);
    return this.obtener(id);
  }

  async vincularCodigo(productoId: string, codigo: string) {
    return this.prisma.enTransaccion(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`codigo:${codigo}`}))`;
      const producto = await tx.producto.findUnique({ where: { id: productoId } });
      if (!producto?.activo) throw new ErrorDominio("PRODUCTO_INVALIDO", "Elige un producto activo", 404);
      const interno = await tx.producto.findUnique({ where: { codigoInterno: codigo } });
      if (/^PROD-\d+$/i.test(codigo) && interno?.id !== productoId) throw new ErrorDominio("CODIGO_INTERNO", "Ese formato está reservado para el consecutivo del negocio. Usa el código de la etiqueta", 409);
      if (interno && interno.id !== productoId) throw new ErrorDominio("CODIGO_EXISTENTE", "Ese código identifica otro producto", 409);
      const existente = await tx.codigoProducto.findUnique({ where: { codigo } });
      if (existente && existente.productoId !== productoId) throw new ErrorDominio("CODIGO_EXISTENTE", "Este código ya pertenece a otro producto. No se cambió su relación", 409);
      if (existente?.retiradoEn) throw new ErrorDominio("CODIGO_RETIRADO", "El administrador retiró este código. Usa un código vigente", 409);
      return existente ?? tx.codigoProducto.create({ data: { productoId, codigo } });
    });
  }

  async codigos(productoId: string) {
    return this.prisma.codigoProducto.findMany({ where: { productoId }, orderBy: [{ creadoEn: "desc" }, { id: "asc" }] });
  }

  async retirarCodigo(productoId: string, codigoId: string) {
    const codigo = await this.prisma.codigoProducto.findFirst({ where: { id: codigoId, productoId } });
    if (!codigo) throw new ErrorDominio("NO_ENCONTRADO", "Código no encontrado", 404);
    return this.prisma.codigoProducto.update({ where: { id: codigoId }, data: { retiradoEn: codigo.retiradoEn ?? new Date() } });
  }

  async productoInicial(conteoId: string, datos: { nombre: string; unidad: string; codigo?: string; productoId?: string }, usuarioId: string, rol: RolUsuario) {
    return this.prisma.enTransaccion(async tx => {
      await this.inventario.verificarAcceso(conteoId, rol);
      // Mismo orden de bloqueos que creación/importación y aplicación inicial.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventario:inicial'))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conteo:${conteoId}`}))`;
      const conteo = await tx.conteoInventario.findUnique({ where: { id: conteoId } });
      if (conteo?.tipo !== "INICIAL" || conteo.estado !== "EN_CURSO") throw new ErrorDominio("CONTEO_CERRADO", "Solo puedes registrar productos en un inventario inicial abierto", 409);
      const producto = datos.productoId ? await this.obtener(datos.productoId) : await this.crear(NuevoProductoSchema.parse({ nombre: datos.nombre, unidad: datos.unidad, precioVenta: 0 }), true);
      if (!producto.activo) throw new ErrorDominio("PRODUCTO_INACTIVO", "El producto está inactivo", 409);
      if (datos.codigo) await this.vincularCodigo(producto.id, datos.codigo);
      await tx.conteoLinea.upsert({ where: { conteoId_productoId: { conteoId, productoId: producto.id } }, update: {}, create: { conteoId, productoId: producto.id, stockTeorico: producto.stockFisico } });
      const linea = await tx.conteoLinea.findUniqueOrThrow({ where: { conteoId_productoId: { conteoId, productoId: producto.id } } });
      const yaContado = linea.stockFisico !== null;
      const asignacion = yaContado ? null : await this.inventario.asignar(conteoId, usuarioId, false, producto.id);
      return { producto, asignacion, yaContado };
    });
  }

  private dto(p: {
    id: string;
    codigoInterno: string;
    productoBaseId: string | null;
    extension: string;
    nombre: string;
    unidad: string;
    precioVenta: Prisma.Decimal;
    costoActual: Prisma.Decimal;
    stockFisico: number;
    stockReservado: number;
    stockMinimo: number;
    colorEtiqueta: string;
    activo: boolean;
    precioPendiente: boolean;
    codigosLectura?: Array<{codigo:string}>;
    creadoEn: Date;
    categoria: { nombre: string } | null;
  }) {
    return {
      id: p.id,
      productoBaseId: p.productoBaseId, extension: p.extension, nombreBase: nombrePrincipal(p), rowid: p.productoBaseId ?? p.id, rowid_ext: p.id,
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
      precioPendiente: p.precioPendiente,
      codigosLectura: p.codigosLectura?.map(c => c.codigo) ?? [],
      creadoEn: p.creadoEn,
    };
  }
}
