import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { FastifyReply } from "fastify";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { AdjuntoEsquema } from "@ambie/contrato";
import { ArchivosService } from "./archivos.service";

@Controller("archivos")
export class ArchivosController {
  constructor(private readonly archivos: ArchivosService) {}
  @Get()
  async referencias() { return { data: await this.archivos.referencias() }; }
  @Get(":id")
  async descargar(@Param("id") id: string, @Res() respuesta: FastifyReply) {
    const { archivo, stream } = await this.archivos.descargar(id);
    respuesta.header("Content-Type", archivo.mimeType).header("Cache-Control", "private, max-age=300").header("X-Content-Type-Options", "nosniff");
    return respuesta.send(stream);
  }
  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("productos/:id")
  producto(@Param("id") id: string, @Body() body: unknown, @UsuarioActual() usuario: Usuario) { return this.subir("producto", id, body, usuario.id); }
  @Post("pedidos/:id")
  pedido(@Param("id") id: string, @Body() body: unknown, @UsuarioActual() usuario: Usuario) { return this.subir("pedido", id, body, usuario.id); }
  private async subir(tipo: "producto" | "pedido", id: string, body: unknown, usuarioId: string) {
    const datos = AdjuntoEsquema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa el archivo: máximo 5 MB, imagen o PDF");
    return { data: await this.archivos.subir(tipo, id, datos.data, usuarioId) };
  }
}
