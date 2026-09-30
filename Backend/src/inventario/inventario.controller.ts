import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Usuario, RolUsuario } from "@prisma/client";
import { InventarioService } from "./inventario.service";
import { Roles, UsuarioActual } from "../common/guards";
import { IniciarConteoEsquema, ContarLineaEsquema, AjusteManualEsquema } from "@ambie/contrato";

@Roles(RolUsuario.ADMINISTRADOR)
@Controller("inventario")
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get("ajustes")
  listarAjustes() { return this.inventario.listarAjustes(); }

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
    const datos = IniciarConteoEsquema.parse(body);
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
    const datos = ContarLineaEsquema.parse(body);
    return { data: await this.inventario.actualizarLinea(conteoId, productoId, datos.stockFisico) };
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
