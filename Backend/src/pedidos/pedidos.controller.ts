import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Usuario, EstadoPedido, RolUsuario } from "@prisma/client";
import { PedidosService, NuevoPedidoSchema } from "./pedidos.service";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { paginacion } from "../common/paginacion";
import { fechaISO } from "@ambie/contrato";

const ESTADOS_VALIDOS: Record<string, EstadoPedido> = {
  pendiente: EstadoPedido.PENDIENTE,
  "en-preparacion": EstadoPedido.EN_PREPARACION,
  entregado: EstadoPedido.ENTREGADO,
  cancelado: EstadoPedido.CANCELADO,
};

@Controller("pedidos")
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  listar(
    @Query("metodo") metodo?:string,
    @Query("periodo") periodo?:string,
    @Query("clienteId") clienteId?:string,
    @Query("saldoPendiente") saldoPendiente?:string,
    @Query("segmento") segmento?: string,
    @Query("estado") estado?: string,
    @Query("q") q?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    for (const fecha of [desde, hasta]) {
      if (fecha !== undefined && (!fechaISO.safeParse(fecha).success || !Number.isFinite(Date.parse(`${fecha}T00:00:00.000Z`)) || new Date(`${fecha}T00:00:00.000Z`).toISOString().slice(0, 10) !== fecha)) {
        throw new ErrorDominio("VALIDACION", "Usa una fecha válida YYYY-MM-DD");
      }
    }
    return this.pedidos.listar({
      segmento, metodo, periodo, clienteId, saldoPendiente,
      estado,
      q,
      desde,
      hasta,
      ...paginacion(page, pageSize),
    });
  }

  @Get("resumen-ventas")
  async resumenVentas(@UsuarioActual() usuario: Usuario) {
    return {data:await this.pedidos.resumenVentas(usuario.rol === RolUsuario.ADMINISTRADOR)};
  }

  @Get(":pedidoId")
  async obtener(@Param("pedidoId") pedidoId: string) {
    return { data: await this.pedidos.obtener(pedidoId) };
  }

  @Post()
  async crear(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = NuevoPedidoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa las líneas y el método de pago del pedido");
    if (usuario.rol !== RolUsuario.ADMINISTRADOR && datos.data.vendedorId && datos.data.vendedorId !== usuario.id) {
      throw new ErrorDominio("VENDEDOR_INVALIDO", "No puedes registrar ventas con otro usuario", 403);
    }
    return { data: await this.pedidos.crear(datos.data, datos.data.vendedorId ?? usuario.id) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post(":pedidoId/trasladar")
  async trasladar(@Param("pedidoId") pedidoId: string, @UsuarioActual() usuario: Usuario) {
    return { data: await this.pedidos.trasladar(pedidoId, usuario.id) };
  }

  @Patch(":pedidoId/estado")
  async cambiarEstado(
    @Param("pedidoId") pedidoId: string,
    @Body() body: { estado?: string; comentario?: string },
    @UsuarioActual() usuario: Usuario,
  ) {
    const estado = body?.estado ? ESTADOS_VALIDOS[body.estado] : undefined;
    if (!estado) throw new ErrorDominio("VALIDACION", "Estado inválido");
    return { data: await this.pedidos.cambiarEstado(pedidoId, estado, usuario.id, body.comentario) };
  }
}
