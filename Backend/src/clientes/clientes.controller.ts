import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Usuario } from "@prisma/client";
import { ClientesService, NuevoClienteSchema } from "./clientes.service";
import { UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { paginacion } from "../common/paginacion";

@Controller("clientes")
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  async listar(@Query("q") q?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = paginacion(page, pageSize);
    return this.clientes.listar(q, p.pagina, p.porPagina);
  }

  @Get("cartera/resumen")
  listarCartera(@Query("page") page?:string, @Query("pageSize") pageSize?:string, @Query("q") q?:string, @Query("clienteId") clienteId?:string, @Query("orden") orden?:string) { const p=paginacion(page,pageSize); return this.clientes.listarCartera(p.pagina,p.porPagina,q,clienteId,orden); }

  @Get(":clienteId")
  async obtener(@Param("clienteId") clienteId: string) {
    return { data: await this.clientes.obtener(clienteId) };
  }

  @Get(":clienteId/cartera")
  async cartera(@Param("clienteId") clienteId: string) {
    return { data: await this.clientes.cartera(clienteId) };
  }

  @Post()
  async crear(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = NuevoClienteSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa los datos del cliente");
    return { data: await this.clientes.crear(datos.data, usuario.id) };
  }
}
