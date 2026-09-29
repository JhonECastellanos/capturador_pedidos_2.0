import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { ProductosService, NuevoProductoSchema } from "./productos.service";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";

@Controller("productos")
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get()
  listar(
    @Query("q") q?: string,
    @Query("categoria") categoria?: string,
    @Query("stockEstado") stockEstado?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.productos.listar(q, categoria, stockEstado, Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Get(":productoId")
  async obtener(@Param("productoId") productoId: string) {
    return { data: await this.productos.obtener(productoId) };
  }

  @Get(":productoId/precios")
  async historialPrecios(@Param("productoId") productoId: string, @Query("limite") limite?: string) {
    return this.productos.historialPrecios(productoId, Number(limite ?? 50));
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
    if (typeof body?.nuevoPrecio !== "number" || body.nuevoPrecio < 0) {
      throw new ErrorDominio("VALIDACION", "Precio inválido");
    }
    return { data: await this.productos.actualizarPrecio(productoId, body.nuevoPrecio, usuario.id) };
  }
}
