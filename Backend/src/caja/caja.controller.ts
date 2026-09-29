import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { CajaService } from "./caja.service";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { z } from "zod";

const EgresoSchema = z.object({
  concepto: z.string().min(1),
  monto: z.number().positive(),
  metodo: z.enum(["efectivo", "billetera"]).optional(),
});

@Controller("caja")
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get("movimientos")
  listar(
    @Query("tipo") tipo?: string,
    @Query("metodo") metodo?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.caja.listar({ tipo, metodo, pagina: Number(page ?? 1), porPagina: Number(pageSize ?? 20) });
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("egresos")
  async egreso(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = EgresoSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa el egreso");
    return { data: await this.caja.egresoManual(datos.data, usuario.id) };
  }
}
