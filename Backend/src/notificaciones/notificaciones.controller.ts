import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { z } from "zod";
import { Roles, UsuarioActual } from "../common/guards";
import { NotificacionesService } from "./notificaciones.service";
@Roles(RolUsuario.ADMINISTRADOR)
@Controller("notificaciones")
export class NotificacionesController {
  constructor(private readonly avisos: NotificacionesService) {}
  @Get() listar(@UsuarioActual() usuario: Usuario, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("recientes") recientes?: string) { return this.avisos.listar(usuario, page, pageSize, z.enum(["true", "false"]).optional().parse(recientes) === "true"); }
  @Post(":id/leer") leer(@Param("id") id: string, @UsuarioActual() usuario: Usuario, @Body() body: unknown) { z.object({}).strict().parse(body); return this.avisos.leer(id, usuario); }
}
