import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { CierresService } from "./cierres.service";
import { paginacion } from "../common/paginacion";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { z } from "zod";

const CierreSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trasladar: z.array(z.string()).optional(),
  cancelar: z.array(z.string()).optional(),
  conteoEfectivo: z.number().min(0).optional(),
  conteoBilletera: z.number().min(0).optional(),
});

@Roles(RolUsuario.ADMINISTRADOR)
@Controller("cierres")
export class CierresController {
  constructor(private readonly cierres: CierresService) {}

  @Get(":fecha/previsualizacion")
  async previsualizar(@Param("fecha") fecha: string) {
    return { data: await this.cierres.previsualizar(fecha) };
  }

  @Post(":fecha")
  async crear(@Param("fecha") fecha: string, @Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = CierreSchema.safeParse({ ...(typeof body === "object" && body ? body : {}), fecha });
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa los datos del cierre");
    return { data: await this.cierres.crear(datos.data, usuario.id) };
  }

  @Get()
  historial(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = paginacion(page, pageSize);
    return this.cierres.historial(p.pagina, p.porPagina);
  }
}
