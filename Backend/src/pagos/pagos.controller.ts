import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Usuario } from "@prisma/client";
import { PagosService } from "./pagos.service";
import { paginacion } from "../common/paginacion";
import { UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { z } from "zod";

const AbonoSchema = z.object({
  monto: z.number().positive(),
  metodo: z.enum(["efectivo", "billetera"]),
  comentario: z.string().optional(),
});

const PagoDirectoSchema = z.object({
  monto: z.number().positive().optional(),
  metodo: z.enum(["efectivo", "billetera"]),
  comentario: z.string().optional(),
});

@Controller()
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Post("clientes/:clienteId/abonos")
  async abono(@Param("clienteId") clienteId: string, @Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = AbonoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Monto inválido o método de pago inválido");
    return { data: await this.pagos.abono(clienteId, datos.data, usuario.id) };
  }

  @Post("pedidos/:pedidoId/pagos")
  async pagoDirecto(@Param("pedidoId") pedidoId: string, @Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = PagoDirectoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa el cobro");
    return { data: await this.pagos.pagoDirecto(pedidoId, datos.data, usuario.id) };
  }

  @Get("abonos")
  async historial(@Query("clienteId") clienteId?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = paginacion(page, pageSize);
    return this.pagos.historial(clienteId, p.pagina, p.porPagina);
  }
}
