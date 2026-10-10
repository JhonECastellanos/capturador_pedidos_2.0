import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { z } from "zod";
import { ContextoAgenteEsquema, InstruccionAgenteEsquema } from "@ambie/contrato";
import { Roles, UsuarioActual } from "../common/guards";
import { AgentesService } from "./agentes.service";

const roles = [RolUsuario.ADMINISTRADOR, RolUsuario.VENDEDOR, RolUsuario.INVENTARIO];
@Controller("agentes")
export class AgentesController {
  constructor(private readonly agentes: AgentesService) {}
  @Roles(...roles) @Get("estado") estado() { return this.agentes.estado().then(data => ({ data })); }
  @Roles(RolUsuario.ADMINISTRADOR) @Get("configuracion") configuracion() { return this.agentes.configuracion().then(data => ({ data })); }
  @Roles(RolUsuario.ADMINISTRADOR) @Put("configuracion") guardar(@Body() body: unknown) {
    const r = z.object({ configuracion: z.unknown(), version: z.number().int().min(0) }).strict().parse(body);
    return this.agentes.guardar(r.configuracion, r.version).then(data => ({ data }));
  }
  @Roles(RolUsuario.ADMINISTRADOR) @Get("proveedores/:id/modelos") modelos(@Param("id") id: string) { return this.agentes.modelos(z.string().uuid().parse(id)).then(data => ({ data })); }
  @Roles(RolUsuario.ADMINISTRADOR) @Get("local/modelos") modelosLocales() { return this.agentes.modelosLocales().then(data => ({ data })); }
  @Roles(RolUsuario.ADMINISTRADOR) @Post("local/probar") probarLocal() { return this.agentes.probarLocal().then(data => ({ data })); }
  @Roles(RolUsuario.ADMINISTRADOR) @Post("proveedores/:id/probar") probar(@Param("id") id: string) { return this.agentes.probar(z.string().uuid().parse(id)).then(data => ({ data })); }
  @Roles(...roles) @Post("interpretar") interpretar(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const r = z.object({ texto: z.string().trim().min(1).max(6000), contexto: ContextoAgenteEsquema.optional(), anterior: InstruccionAgenteEsquema.optional(), id: z.string().uuid().optional(), version: z.number().int().min(1).optional() }).strict().parse(body);
    return this.agentes.interpretar(r.texto, r.anterior, usuario, r.id, r.version, r.contexto).then(data => ({ data }));
  }
  @Roles(...roles) @Post("revisar") revisar(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const r = z.object({ instruccion: InstruccionAgenteEsquema, id: z.string().uuid(), version: z.number().int().min(1) }).strict().parse(body);
    return this.agentes.revisar(r.instruccion, usuario, r.id, r.version).then(data => ({ data }));
  }
  @Roles(...roles) @Post("audio/transcribir") transcribir(@Body() body: unknown) {
    const r = z.object({ audio: z.string().min(1).max(7 * 1024 * 1024), formato: z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"]), stt: z.enum(["whisper", "moonshine"]), modelo: z.string().regex(/^[a-zA-Z0-9._/-]{1,120}$/), idioma: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/) }).strict().parse(body);
    return this.agentes.audio("transcribir", r).then(data => ({ data }));
  }
  @Roles(RolUsuario.ADMINISTRADOR) @Post("audio/estado") audioEstado() { return this.agentes.audio("estado", {}).then(data => ({ data })); }
  @Roles(...roles) @Post("audio/sesion") sesion() { return this.agentes.sesionAudio().then(data => ({ data })); }
  @Roles(RolUsuario.ADMINISTRADOR) @Post("audio/preparar") prepararAudio(@Body() body: unknown) {
    const r = z.object({ stt: z.enum(["whisper", "moonshine"]), modelo: z.string().regex(/^[a-zA-Z0-9._/-]{1,120}$/), idioma: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/) }).strict().parse(body);
    return this.agentes.audio("preparar", r).then(data => ({ data }));
  }
}
