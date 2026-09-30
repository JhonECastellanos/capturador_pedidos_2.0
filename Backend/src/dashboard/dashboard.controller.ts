import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { Roles } from "../common/guards";
import { RolUsuario } from "@prisma/client";
import { FiltrosTableroEsquema } from "@ambie/contrato";

@Roles(RolUsuario.ADMINISTRADOR)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Acepta `desde`, `hasta`, `dias`, `clienteId` y `vendedorId` para que el
   * tablero pueda moverse entre el día, la semana y el histórico sin
   * pedir un endpoint distinto para cada vista.
   */
  @Get(["resumen", "totales"])
  async resumen(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("dias") dias?: string,
    @Query("clienteId") clienteId?: string,
    @Query("vendedorId") vendedorId?: string,
    @Query("soloTops") soloTops?: string,
  ) {
    return {
      data: await this.dashboard.resumen(FiltrosTableroEsquema.parse({
        desde,
        hasta,
        dias: dias ? Number(dias) : undefined,
        clienteId,
        vendedorId,
        soloTops,
      })),
    };
  }
}
