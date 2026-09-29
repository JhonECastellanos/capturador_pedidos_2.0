import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { InventarioService } from "./inventario.service";
import { Roles, UsuarioActual } from "../common/guards";
import { ErrorDominio } from "../common/errores";

@Controller("inventario")
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get("conteos")
  listarConteos() {
    return this.inventario.listarConteos();
  }

  @Get("conteos/:conteoId")
  async obtenerConteo(@Param("conteoId") conteoId: string) {
    return { data: await this.inventario.obtener(conteoId) };
  }

  @Post("conteos")
  async iniciarConteo(@Body() body: unknown, @UsuarioActual() usuario: Usuario) {
    const datos = body as { tipo?: string; cantidadAleatoria?: number | null; turno?: string };
    if (!datos.tipo || !datos.turno) throw new ErrorDominio("VALIDACION", "Faltan datos del conteo");
    return {
      data: await this.inventario.iniciarConteo(
        {
          tipo: datos.tipo as "general" | "aleatorio",
          cantidadAleatoria: datos.cantidadAleatoria ?? null,
          turno: datos.turno,
        },
        usuario.id,
      ),
    };
  }

  @Patch("conteos/:conteoId/lineas/:productoId")
  async actualizarLinea(
    @Param("conteoId") conteoId: string,
    @Param("productoId") productoId: string,
    @Body() body: { stockFisico?: number },
  ) {
    if (typeof body?.stockFisico !== "number" || body.stockFisico < 0) {
      throw new ErrorDominio("VALIDACION", "Cantidad física inválida");
    }
    return { data: await this.inventario.actualizarLinea(conteoId, productoId, body.stockFisico) };
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
    if (!body?.productoId || typeof body.stockFisico !== "number" || body.stockFisico < 0) {
      throw new ErrorDominio("VALIDACION", "Revisa el ajuste");
    }
    return {
      data: await this.inventario.ajusteManual(
        body.productoId,
        body.stockFisico,
        body.motivo ?? "corrección",
        body.comentario,
        usuario.id,
      ),
    };
  }
}
