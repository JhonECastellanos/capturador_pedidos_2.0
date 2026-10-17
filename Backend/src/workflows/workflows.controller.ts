import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Res, Req } from "@nestjs/common";
import { RolUsuario, Usuario } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";
import { AgentesService } from "../agentes/agentes.service";
import { WorkflowsService } from "./workflows.service";
import { ConocimientoEsquema, PruebaConocimientoEsquema, InstruccionAgenteEsquema, ContextoAgenteEsquema } from "@abinova/contrato";
import { PrismaService } from "../common/prisma.module";
import { LicenciasService } from "../licencias/licencias.service";

@Controller("comercial")
export class ComercialController {
  constructor(private readonly servicio: WorkflowsService) {}
  @Public() @Get("planes")
  async planes(@Res({ passthrough: true }) reply: FastifyReply) { reply.header("Cache-Control", "no-store"); return { data: await this.servicio.pedir("/planes") }; }
  @Public() @Post("asistente") @HttpCode(200)
  async asistente(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    const d = z.object({ texto: z.string().trim().min(1).max(1000), conversacion: z.string().uuid() }).strict().parse(body);
    return { data: await this.servicio.comercial(d.texto, d.conversacion, request.ip) };
  }
  @Roles(RolUsuario.ADMINISTRADOR) @Put("planes")
  async guardar(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    if (!usuario.esSistema) throw new ErrorDominio("COMERCIAL_PERMISO", "Este ajuste pertenece al operador de ABINOVA", 403);
    const datos = z.object({ version: z.number().int().positive(), planes: z.array(z.object({ nombre: z.enum(["Esencial", "Negocios", "Profesional"]), precio: z.number().int().min(1000).max(100000000), creditosMensuales: z.number().int().min(0).max(10000000), descripcion: z.string().trim().min(1).max(300).optional(), beneficios: z.array(z.string().trim().min(1).max(180)).min(1).max(4).optional() }).strict()).length(3), promocion: z.object({ descuentoAnual: z.number().int().min(0).max(80), mesesPagados: z.literal(12), mesesGratis: z.number().int().min(0).max(12), nota: z.string().trim().max(400) }).strict().optional() }).strict().parse(body);
    return { data: await this.servicio.pedir("/planes", "PUT", datos) };
  }
}

@Roles(RolUsuario.ADMINISTRADOR) @Controller("workflows")
export class WorkflowsController {
  constructor(private readonly servicio: WorkflowsService, private readonly agentes: AgentesService, private readonly prisma: PrismaService, private readonly licencias: LicenciasService) {}
  @Get("empresas/:empresa/conocimiento") async conocimiento(@UsuarioActual() u: Usuario, @Param("empresa") e: string) { return { data: await this.servicio.empresa(u, e, "conocimiento") }; }
  @Get("empresas/:empresa/conexiones") async conexiones(@UsuarioActual() u: Usuario, @Param("empresa") e: string) { return { data: await this.servicio.empresa(u, e, "conexiones") }; }
  @Post("empresas/:empresa/despublicar") @HttpCode(200) async despublicar(@UsuarioActual() u: Usuario, @Param("empresa") e: string) { return { data: await this.servicio.empresa(u, e, "despublicar", "POST", {}) }; }
  @Put("empresas/:empresa/conocimiento") async guardarConocimiento(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Body() b: unknown) {
    return { data: await this.servicio.empresa(u, e, "conocimiento", "PUT", ConocimientoEsquema.parse(b)) };
  }
  @Post("empresas/:empresa/probar") @HttpCode(200) async probar(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Body() b: unknown) {
    const datos = PruebaConocimientoEsquema.parse(b);
    if (!u.esSistema) {
      const permiso = ({ ventas: "pedidos", productos: "inventario", compras: "inventario", inventario: "inventario", creditos: "cobros", caja: "caja", cierre: "cierre-diario", chat: "chat", agentes: "agentes" } as Record<string, string>)[datos.modulo] ?? datos.modulo;
      if (u.permisosDenegados.includes(permiso)) throw new ErrorDominio("WORKFLOW_PERMISO", "Tu administrador deshabilitó este permiso", 403);
      await this.licencias.exigirVigente(u, [datos.modulo]);
    }
    return { data: await this.servicio.empresa(u, e, "probar", "POST", { ...datos, actor: u.id }) };
  }
  @Public() @Post("datos") @HttpCode(200) async datos(@Headers("authorization") auth: string | undefined, @Body() b: unknown) {
    this.servicio.validarBridge(auth);
    const d = z.object({ recurso: z.enum(["productos", "sql"]), actor: z.string().uuid() }).strict().parse(b);
    const usuario = await this.prisma.usuario.findUnique({ where: { id: d.actor } });
    if (!usuario || !usuario.activo || usuario.eliminadoEn) throw new ErrorDominio("WORKFLOW_USUARIO", "El usuario ya no está activo", 403);
    if (d.recurso === "sql") {
      if (!usuario.esSistema && (usuario.rol !== RolUsuario.ADMINISTRADOR || usuario.permisosDenegados.length > 0)) throw new ErrorDominio("WORKFLOW_SQL", "Esta fuente requiere acceso completo del administrador o maestro", 403);
      await this.licencias.exigirVigente(usuario, ["agentes"]);
      return { data: { permitido: true } };
    }
    if (usuario.rol === RolUsuario.INVENTARIO) return { data: [] };
    const opciones = ["productos", "ventas", "inventario", "compras"].filter(m => usuario.esSistema || !usuario.permisosDenegados.includes(m === "ventas" ? "pedidos" : "inventario"));
    if (!opciones.length) throw new ErrorDominio("WORKFLOW_PERMISO", "Este usuario no tiene acceso al catálogo", 403);
    await this.licencias.exigirVigente(usuario, opciones);
    return { data: await this.prisma.producto.findMany({ where: { activo: true }, take: 30, orderBy: { nombre: "asc" }, select: { nombre: true, codigoInterno: true, precioVenta: true, unidad: true } }) };
  }
  @Public() @Post("validar-modulo") @HttpCode(200) async validarModulo(@Headers("authorization") auth: string | undefined, @Body() b: unknown) {
    this.servicio.validarBridge(auth);
    const { modulo, actor } = z.object({ modulo: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/), actor: z.string().uuid() }).strict().parse(b);
    const usuario = await this.prisma.usuario.findUnique({ where: { id: actor } });
    if (!usuario || !usuario.activo || usuario.eliminadoEn || usuario.rol !== RolUsuario.ADMINISTRADOR) throw new ErrorDominio("WORKFLOW_USUARIO", "Este acceso ya no permite ejecutar workflows", 403);
    const permiso = ({ ventas: "pedidos", productos: "inventario", compras: "inventario", inventario: "inventario", creditos: "cobros", cierre: "cierre-diario" } as Record<string, string>)[modulo] ?? modulo;
    if (!usuario.esSistema && usuario.permisosDenegados.includes(permiso)) throw new ErrorDominio("WORKFLOW_PERMISO", "Este permiso fue retirado", 403);
    await this.licencias.exigirVigente(usuario, [modulo]);
    return { data: { permitido: true } };
  }
  @Public() @Post("interpretar") @HttpCode(200) async interpretar(@Headers("authorization") auth: string | undefined, @Body() b: unknown) {
    this.servicio.validarBridge(auth);
    const d = z.object({ texto: z.string().min(1).max(6000), actor: z.string().uuid(), rol: z.nativeEnum(RolUsuario), conocimiento: z.string().max(28000), anterior: InstruccionAgenteEsquema.optional(), contexto: ContextoAgenteEsquema.optional(), id: z.string().uuid(), version: z.number().int().positive(), conversacion: z.string().uuid(), modulo: z.literal("agentes") }).strict().parse(b);
    const usuario = await this.prisma.usuario.findUnique({ where: { id: d.actor } });
    if (!usuario || !usuario.activo || usuario.eliminadoEn) throw new ErrorDominio("WORKFLOW_USUARIO", "El usuario ya no está activo", 403);
    if (usuario.rol !== d.rol) throw new ErrorDominio("WORKFLOW_ROL", "El rol cambió. Repite la instrucción con tus permisos actuales", 403);
    if (!usuario.esSistema && usuario.permisosDenegados.includes("agentes")) throw new ErrorDominio("WORKFLOW_PERMISO", "Este usuario no puede usar el agente", 403);
    await this.licencias.exigirVigente(usuario, ["agentes"]);
    return { data: await this.agentes.interpretar(d.texto, d.anterior, usuario, d.id, d.version, d.contexto, d.conversacion, true, d.conocimiento) };
  }
  @Get("operador") async operador(@UsuarioActual() u: Usuario) {
    if (!u.esSistema) throw new ErrorDominio("OPERADOR_PERMISO", "Este acceso pertenece al operador de ABINOVA", 403);
    return { data: { empresas: await this.servicio.empresas(u), aprovisionamientoAutomatico: false } };
  }
  @Get("empresas") async empresas(@UsuarioActual() u: Usuario) { return { data: await this.servicio.empresas(u) }; }
  @Get("empresas/:empresa/resumen") async resumen(@UsuarioActual() u: Usuario, @Param("empresa") e: string) { return { data: await this.servicio.empresa(u, e, "resumen") }; }
  @Put("empresas/:empresa/configuracion") async configurar(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Body() b: unknown) { return { data: await this.servicio.empresa(u, e, "configuracion", "PUT", b) }; }
  @Put("empresas/:empresa/flujos/:id") async flujo(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Param("id") id: string, @Body() b: unknown) {
    if (!/^[a-zA-Z0-9_-]{1,70}$/.test(id)) throw new ErrorDominio("WORKFLOW_ID", "Identificador inválido");
    return { data: await this.servicio.empresa(u, e, `flujos/${id}`, "PUT", b) };
  }
  @Post("empresas/:empresa/ejecuciones") @HttpCode(200) async crear(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Body() b: unknown) {
    const datos = z.object({ id: z.string().uuid(), flujo: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/) }).strict().parse(b);
    return { data: await this.servicio.empresa(u, e, "ejecuciones", "POST", { ...datos, actor: u.id, rol: u.rol }) };
  }
  @Get("empresas/:empresa/ejecuciones/:id") async ejecucion(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Param("id") id: string) { return { data: await this.servicio.empresa(u, e, `ejecuciones/${z.string().uuid().parse(id)}`) }; }
  @Post("empresas/:empresa/ejecuciones/:id/:accion") @HttpCode(200) async accion(@UsuarioActual() u: Usuario, @Param("empresa") e: string, @Param("id") id: string, @Param("accion") a: string) {
    const accion = z.enum(["paso", "ejecutar", "pausar", "cancelar", "reiniciar"]).parse(a);
    return { data: await this.servicio.empresa(u, e, `ejecuciones/${z.string().uuid().parse(id)}/${accion}`, "POST", { actor: u.id, rol: u.rol }) };
  }
  @Public() @Post("modelo") @HttpCode(200)
  async modelo(@Headers("authorization") auth: string | undefined, @Body() b: unknown) {
    this.servicio.validarBridge(auth);
    const d = z.object({ texto: z.string().min(1).max(64000), proveedorId: z.string().max(100).nullish(), modelo: z.string().max(150).nullish(), limiteTokens: z.number().int().min(64).max(4096), local: z.boolean(), modalidad: z.enum(["propia", "creditos", "local"]) }).strict().parse(b);
    return { data: await this.agentes.textoWorkflow(d.texto, d.proveedorId ?? undefined, d.modelo ?? undefined, d.limiteTokens, d.local, d.modalidad === "creditos") };
  }
}
