import { Body, Controller, Get, Global, Header, Module, Param, Put } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { AccesoComercialEsquema, AsignacionModulosEsquema, CatalogoModulosEsquema } from "@abinova/contrato";
import { z } from "zod";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { pedirControlWorkflow } from "../common/workflow-control";
import { LicenciasService } from "./licencias.service";

@Controller("licencia")
@Roles(RolUsuario.ADMINISTRADOR, RolUsuario.VENDEDOR, RolUsuario.INVENTARIO)
class LicenciaController {
  constructor(private readonly licencias: LicenciasService) {}
  @Get() @Header("Cache-Control", "no-store") async obtener() { return { data: await this.licencias.obtener() }; }
}
@Controller("control") @Roles(RolUsuario.ADMINISTRADOR)
class ControlModulosController {
  constructor(private readonly licencias: LicenciasService) {}
  private operador(u: Usuario) { if (!u.esSistema) throw new ErrorDominio("OPERADOR_PERMISO", "Solo el operador puede cambiar los módulos contratados", 403); }
  @Get("modulos") async catalogo(@UsuarioActual() u: Usuario) { this.operador(u); return { data: CatalogoModulosEsquema.parse(await pedirControlWorkflow("/modulos", "GET", undefined, undefined, true)) }; }
  @Put("modulos") async guardar(@UsuarioActual() u: Usuario, @Body() b: unknown) {
    this.operador(u); const datos = CatalogoModulosEsquema.parse(b);
    const resultado = await pedirControlWorkflow("/modulos", "PUT", datos, undefined, true); this.licencias.invalidar(); return { data: resultado };
  }
  @Get("empresas/:id/asignacion") async asignacion(@UsuarioActual() u: Usuario, @Param("id") id: string) {
    this.operador(u); z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/).parse(id);
    return { data: { asignacion: AsignacionModulosEsquema.parse(await pedirControlWorkflow(`/empresas/${id}/asignacion`, "GET", undefined, undefined, true)), acceso: AccesoComercialEsquema.parse(await pedirControlWorkflow(`/empresas/${id}/acceso`, "GET", undefined, undefined, true)) } };
  }
  @Put("empresas/:id/asignacion") async asignar(@UsuarioActual() u: Usuario, @Param("id") id: string, @Body() b: unknown) {
    this.operador(u); z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/).parse(id);
    const datos = AsignacionModulosEsquema.parse(b); const resultado = await pedirControlWorkflow(`/empresas/${id}/asignacion`, "PUT", datos, undefined, true);
    this.licencias.invalidar(); return { data: resultado };
  }
}
@Global() @Module({ providers: [LicenciasService], exports: [LicenciasService], controllers: [LicenciaController, ControlModulosController] })
export class LicenciasModule {}
