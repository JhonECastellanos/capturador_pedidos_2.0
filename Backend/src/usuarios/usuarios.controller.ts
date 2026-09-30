import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { UsuariosService } from "./usuarios.service";
import { Roles, UsuarioActual } from "../common/guards";
import { CambiarRolUsuarioEsquema, CrearUsuarioEsquema } from "@ambie/contrato";
import { ErrorDominio } from "../common/errores";

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
    const datos = CrearUsuarioEsquema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa los datos del usuario");
    return { data: await this.usuarios.crear(datos.data) };
  }

  @Patch(":usuarioId/estado")
  async cambiarEstado(@Param("usuarioId") usuarioId: string, @UsuarioActual() actor: Usuario) {
    return { data: await this.usuarios.cambiarEstado(usuarioId, actor.id) };
  }

  @Patch(":usuarioId/rol")
  async cambiarRol(@Param("usuarioId") usuarioId: string, @Body() body: unknown, @UsuarioActual() actor: Usuario) {
    const datos = CambiarRolUsuarioEsquema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Rol inválido");
    return { data: await this.usuarios.cambiarRol(usuarioId, datos.data.rol, actor.id) };
  }
}
