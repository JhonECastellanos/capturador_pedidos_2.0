import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { ConfiguracionAsistenteEsquema, EntenderAsistenteEsquema } from "@ambie/contrato";
import { Roles, UsuarioActual, RequestAutenticado } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { AsistenteService } from "./asistente.service";
import { ConfiguracionAsistente } from "./configuracion-asistente";
import { VozService } from "./voz.service";

@Controller("asistente")
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService, private readonly configuracion: ConfiguracionAsistente, private readonly voz: VozService) {}
  @Post("voz/sesion")
  async sesionVoz(@UsuarioActual() usuario: Usuario, @Req() request: RequestAutenticado) {
    return { data: await this.voz.ticket(usuario.id, request.sessionId!) };
  }
  @Roles(RolUsuario.ADMINISTRADOR)
  @Get("voz/estado")
  async estadoVoz() { return { data: { disponible: await this.voz.disponible() } }; }
  @Post("entender")
  async entender(@Body() cuerpo: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = EntenderAsistenteEsquema.safeParse(cuerpo);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Escribe una instrucción de entre 2 y 2000 caracteres.");
    return { data: await this.asistente.entender(datos.data.texto, usuario.rol === RolUsuario.ADMINISTRADOR ? "administrador" : "vendedor", usuario.id, datos.data.pendiente, datos.data.campo) };
  }
  @Get("preferencias")
  async preferencias() {
    const config = await this.configuracion.publica();
    return { data: { vozHabilitada: config.vozHabilitada, confirmacionVoz: config.confirmacionVoz, responderConVoz: config.responderConVoz, proveedor: config.proveedor } };
  }
  @Roles(RolUsuario.ADMINISTRADOR)
  @Get("configuracion")
  async obtener() { return { data: await this.configuracion.publica() }; }
  @Roles(RolUsuario.ADMINISTRADOR)
  @Put("configuracion")
  async guardar(@Body() cuerpo: unknown) {
    const datos = ConfiguracionAsistenteEsquema.safeParse(cuerpo);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Revisa la configuración del asistente.");
    return { data: await this.configuracion.guardar(datos.data) };
  }
  @Roles(RolUsuario.ADMINISTRADOR)
  @Get("modelos")
  async modelos() { return { data: await this.asistente.modelos() }; }
}
