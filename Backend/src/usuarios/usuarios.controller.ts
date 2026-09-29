import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RolUsuario } from "@prisma/client";
import { UsuariosService } from "./usuarios.service";
import { Roles } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { z } from "zod";

const CrearUsuarioSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  rol: z.enum(["administrador", "vendedor"]),
  password: z.string().min(6),
});

@Roles(RolUsuario.ADMINISTRADOR)
@Controller("usuarios")
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  async crear(@Body() body: unknown) {
    const datos = CrearUsuarioSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa los datos del usuario");
    return { data: await this.usuarios.crear(datos.data) };
  }

  @Patch(":usuarioId/estado")
  async cambiarEstado(@Param("usuarioId") usuarioId: string) {
    return { data: await this.usuarios.cambiarEstado(usuarioId) };
  }
}
