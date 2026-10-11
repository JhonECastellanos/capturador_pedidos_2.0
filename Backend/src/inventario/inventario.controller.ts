import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { InventarioService } from "./inventario.service";
import { Roles, UsuarioActual } from "../common/guards";
import { IniciarConteoEsquema, ContarLineaEsquema, AjusteManualEsquema } from "@ambie/contrato";
import { ErrorDominio } from "../common/errores";
import { z } from "zod";
import { paginacion } from "../common/paginacion";

@Roles(RolUsuario.ADMINISTRADOR)
@Controller("inventario")
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Get("compartidos")
  compartidos(@UsuarioActual() usuario: Usuario, @Query("page") page?: string, @Query("abiertos") abiertos?: string, @Query("pageSize") pageSize?: string) {
    return this.inventario.resumenes(paginacion(page, pageSize ?? "30").pagina, Math.min(30, paginacion(page, pageSize ?? "30").porPagina), abiertos === "true", usuario.rol === RolUsuario.ADMINISTRADOR, undefined, usuario.rol);
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.VENDEDOR)
  @Post("compartidos")
  async iniciarCompartido(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = IniciarConteoEsquema.parse(body);
    if (usuario.rol === RolUsuario.VENDEDOR && datos.tipo !== "aleatorio") throw new ErrorDominio("SIN_PERMISO", "El vendedor solo puede iniciar el conteo diario", 403);
    const resultado = await this.inventario.iniciarCompartido(datos.tipo, usuario.id);
    if (usuario.rol === RolUsuario.VENDEDOR) await this.inventario.verificarAcceso(resultado.id, usuario.rol);
    return { data: resultado };
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Get("compartidos/:conteoId")
  async resumenCompartido(@Param("conteoId") id: string, @UsuarioActual() usuario: Usuario) {
    await this.inventario.verificarAcceso(id, usuario.rol);
    return { data: (await this.inventario.resumenes(1, 1, false, usuario.rol === RolUsuario.ADMINISTRADOR, id, usuario.rol)).data[0] ?? null };
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Get("compartidos/:conteoId/lineas")
  async lineasCompartidas(@Param("conteoId") id: string, @UsuarioActual() usuario: Usuario, @Query("page") page?: string, @Query("q") q = "", @Query("pageSize") pageSize?: string) {
    await this.inventario.verificarAcceso(id, usuario.rol);
    return this.inventario.lineasCompartidas(id, paginacion(page, pageSize ?? "30").pagina, Math.min(30, paginacion(page, pageSize ?? "30").porPagina), q.trim().slice(0, 100), usuario.rol === RolUsuario.ADMINISTRADOR);
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Post("compartidos/:conteoId/asignar")
  async asignar(@Param("conteoId") id: string, @UsuarioActual() usuario: Usuario, @Query("liberar") liberar?: string, @Body() body?: unknown) {
    await this.inventario.verificarAcceso(id, usuario.rol);
    const datos = z.object({ productoId: z.string().uuid().optional() }).parse(body ?? {});
    return { data: await this.inventario.asignar(id, usuario.id, liberar === "true", datos.productoId) };
  }

  @Get("inicial")
  async inicial(@Query("page") page?: string, @Query("q") q?: string, @Query("pageSize") pageSize?: string) {
    const p = paginacion(page, pageSize);
    return { data: await this.inventario.inicial(p.pagina, q, p.porPagina) };
  }

  @Get("ajustes")
  listarAjustes(@Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("q") q?: string) { const p = paginacion(page, pageSize); return this.inventario.listarAjustes(p.pagina, p.porPagina, q); }

  @Get("descuadres")
  listarDescuadres(@Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("q") q?: string) { const p = paginacion(page, pageSize); return this.inventario.listarDescuadres(p.pagina, p.porPagina, q); }

  @Get("conteos")
  listarConteos(@Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("actuales") actuales?: string) {
    const p = paginacion(page, pageSize);
    return this.inventario.listarConteos(p.pagina, p.porPagina, actuales === "true");
  }

  @Get("conteos/:conteoId")
  async obtenerConteo(@Param("conteoId") conteoId: string) {
    return { data: await this.inventario.obtener(conteoId) };
  }

  @Post("conteos")
  async iniciarConteo(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = IniciarConteoEsquema.parse(body);
    return {
      data: await this.inventario.iniciarConteo(
        {
          tipo: datos.tipo,
          cantidadAleatoria: datos.cantidadAleatoria,
          turno: datos.turno,
        },
        usuario.id,
      ),
    };
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.INVENTARIO, RolUsuario.VENDEDOR)
  @Patch("conteos/:conteoId/lineas/:productoId")
  async actualizarLinea(
    @Param("conteoId") conteoId: string,
    @Param("productoId") productoId: string,
    @Body() body: { stockFisico?: number },
    @UsuarioActual() usuario: Usuario,
    @Query("resumen") resumen?: string,
  ) {
    await this.inventario.verificarAcceso(conteoId, usuario.rol);
    const datos = ContarLineaEsquema.parse(body);
    return { data: await this.inventario.actualizarLinea(conteoId, productoId, datos.stockFisico, usuario.id, resumen !== "true" && usuario.rol === RolUsuario.ADMINISTRADOR, datos.contadoEnEsperado) };
  }

  @Post("conteos/:conteoId/finalizar")
  async finalizar(@Param("conteoId") conteoId: string) {
    return { data: await this.inventario.finalizar(conteoId) };
  }

  @Post("conteos/:conteoId/cancelar")
  async cancelar(@Param("conteoId") conteoId: string) {
    return { data: await this.inventario.cancelar(conteoId) };
  }

  @Post("conteos/:conteoId/aplicar-ajuste")
  async aplicarAjuste(@Param("conteoId") conteoId: string, @UsuarioActual() usuario: Usuario) {
    return { data: await this.inventario.aplicarAjuste(conteoId, usuario.id) };
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post("ajustes")
  async ajusteManual(
    @Body() body: { productoId?: string; stockFisico?: number; motivo?: string; comentario?: string },
    @UsuarioActual() usuario: Usuario,
  ) {
    const datos = AjusteManualEsquema.parse(body);
    return {
      data: await this.inventario.ajusteManual(
        datos.productoId,
        datos.stockFisico,
        datos.motivo ?? "corrección",
        datos.comentario,
        usuario.id,
      ),
    };
  }
}
