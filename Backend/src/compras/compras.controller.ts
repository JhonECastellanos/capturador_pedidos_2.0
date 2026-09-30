import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { ComprasService } from "./compras.service";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { z } from "zod";
import { paginacion } from "../common/paginacion";

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

@Controller()
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get("proveedores")
  listarProveedores() {
    return this.compras.listarProveedores();
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("proveedores")
  async crearProveedor(@Body() body: { nombre?: string; telefono?: string }) {
    if (!body?.nombre?.trim()) throw new ErrorDominio("VALIDACION", "Nombre del proveedor requerido");
    return { data: await this.compras.crearProveedor(body.nombre, body.telefono) };
  }

  @Get("recepciones-compra")
  listarRecepciones(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = paginacion(page, pageSize);
    return this.compras.listarRecepciones(p.pagina, p.porPagina);
  }

  @Get("gastos")
  listarGastos(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.compras.listarGastos({
      desde,
      hasta,
      ...paginacion(page, pageSize),
    });
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("recepciones-compra")
  async registrarRecepcion(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = RecepcionSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa las líneas de la recepción");
    return { data: await this.compras.registrarRecepcion(datos.data, usuario.id) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("gastos")
  async registrarGasto(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = GastoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa el gasto");
    return { data: await this.compras.registrarGasto(datos.data, usuario.id) };
  }
}
