import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Usuario, EstadoPedido } from "@prisma/client";
import { PedidosService, NuevoPedidoSchema } from "./pedidos.service";
import { UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";

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
    @Query("segmento") segmento?: string,
    @Query("estado") estado?: string,
    @Query("q") q?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.pedidos.listar({
      segmento,
      estado,
      q,
      desde,
      hasta,
      pagina: Number(page ?? 1),
      porPagina: Number(pageSize ?? 20),
    });
  }

  @Get(":pedidoId")
  async obtener(@Param("pedidoId") pedidoId: string) {
    return { data: await this.pedidos.obtener(pedidoId) };
  }

  @Post()
  async crear(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = NuevoPedidoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa las líneas y el método de pago del pedido");
    return { data: await this.pedidos.crear(datos.data, datos.data.vendedorId ?? usuario.id) };
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
