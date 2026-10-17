import { Body, Controller, Get, Put, Res } from "@nestjs/common";
import { RolUsuario } from "@prisma/client";
import { FastifyReply } from "fastify";
import { AparienciaEsquema } from "@abinova/contrato";
import { Public, Roles } from "../common/guards";
import { AparienciaService } from "./apariencia.service";
@Controller("apariencia")
export class AparienciaController {
  constructor(private readonly apariencia: AparienciaService) {}
  @Public()
  @Get()
  async obtener(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    return { data: await this.apariencia.obtener() };
  }
  @Roles(RolUsuario.ADMINISTRADOR)
  @Put()
  async guardar(@Body() body: unknown) { return { data: await this.apariencia.guardar(AparienciaEsquema.parse(body)) }; }
}
