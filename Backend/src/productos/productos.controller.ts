import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { ProductosService, NuevoProductoSchema } from "./productos.service";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { paginacion } from "../common/paginacion";
import { ImportarProductosEsquema, CodigoLecturaEsquema, VincularCodigoEsquema, CambiarPrecioEsquema, ProductoInicialEsquema } from "@abinova/contrato";
import { z } from "zod";

@Controller("productos")
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Get()
  async listar(
    @UsuarioActual() usuario: Usuario,
    @Query("q") q?: string,
    @Query("categoria") categoria?: string,
    @Query("stockEstado") stockEstado?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("orden") orden?: string,
    @Query("activo") activo?: string,
    @Query("familiaId") familiaId?: string,
  ) {
    const p = paginacion(page, pageSize);
    const resultado = await this.productos.listar(q, categoria, usuario.rol === RolUsuario.INVENTARIO ? undefined : stockEstado, p.pagina, p.porPagina, usuario.rol === RolUsuario.INVENTARIO ? "nombre" : orden, activo === "true" || usuario.rol === RolUsuario.INVENTARIO, z.string().uuid().optional().parse(familiaId));
    return { ...resultado, data: resultado.data.map(p => this.catalogoPermitido(p, usuario.rol)), ...(usuario.rol === RolUsuario.INVENTARIO ? { meta: { ...resultado.meta, alertas: 0 } } : {}) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Get("cambios-precio")
  listarCambios(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = paginacion(page, pageSize);
    return this.productos.listarCambios(p.pagina, p.porPagina);
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Get("codigo/lectura")
  async resolver(@Query("codigo") codigo: string, @UsuarioActual() usuario: Usuario) {
    const producto = await this.productos.resolverCodigo(CodigoLecturaEsquema.parse(codigo));
    return { data: producto ? this.catalogoPermitido(producto, usuario.rol) : null };
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO)
  @Post("inicial/:conteoId")
  async crearInicial(@Param("conteoId") conteoId: string, @Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const resultado = await this.productos.productoInicial(conteoId, ProductoInicialEsquema.parse(body), usuario.id, usuario.rol);
    return { data: { ...resultado, producto: this.catalogoPermitido(resultado.producto, usuario.rol) } };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Get(":productoId/codigos")
  async codigos(@Param("productoId") id: string) { return { data: await this.productos.codigos(id) }; }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post(":productoId/codigos")
  async vincular(@Param("productoId") id: string, @Body() body: unknown) {
    const datos = VincularCodigoEsquema.parse(body);
    return { data: await this.productos.vincularCodigo(id, datos.codigo) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post(":productoId/codigos/:codigoId/retirar")
  async retirar(@Param("productoId") id: string, @Param("codigoId") codigoId: string) { return { data: await this.productos.retirarCodigo(id, codigoId) }; }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Get(":productoId")
  async obtener(@Param("productoId") productoId: string, @UsuarioActual() usuario: Usuario) {
    return { data: this.catalogoPermitido(await this.productos.obtener(productoId), usuario.rol) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("importar")
  async importar(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = ImportarProductosEsquema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", `Revisa el archivo: ${datos.error.issues[0]?.message ?? "datos inválidos"}. Máximo 200 productos por carga`);
    return { data: await this.productos.importar(datos.data, usuario.id) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Get(":productoId/historial")
  async historialProducto(@Param("productoId") productoId: string, @Query("limite") limite?: string) {
    return this.productos.historialProducto(productoId, paginacion("1", limite ?? "50").porPagina);
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post()
  async crear(@Body() body: unknown) {
    const datos = NuevoProductoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa los datos del producto");
    return { data: await this.productos.crear(datos.data) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post(":productoId/precio")
  async actualizarPrecio(
    @Param("productoId") productoId: string,
    @Body() body: { nuevoPrecio?: number },
    @UsuarioActual() usuario: Usuario,
  ) {
    const datos = CambiarPrecioEsquema.parse(body);
    return { data: await this.productos.actualizarPrecio(productoId, datos.nuevoPrecio, usuario.id, datos) };
  }
  private catalogoPermitido<T extends Awaited<ReturnType<ProductosService["obtener"]>>>(producto: T, rol: RolUsuario) {
    return rol === RolUsuario.INVENTARIO ? { ...producto, precioVenta: 0, costoActual: 0, stock: 0, stockFisico: 0, stockReservado: 0, stockDisponible: 0, stockMinimo: 0 } : producto;
  }

}
