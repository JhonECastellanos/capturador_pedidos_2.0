import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Acepta `desde`, `hasta`, `dias`, `clienteId` y `vendedorId` para que el
   * tablero pueda moverse entre el día, la semana y el histórico sin
   * pedir un endpoint distinto para cada vista.
   */
  @Get("resumen")
  async resumen(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("dias") dias?: string,
    @Query("clienteId") clienteId?: string,
    @Query("vendedorId") vendedorId?: string,
  ) {
    return {
      data: await this.dashboard.resumen({
        desde,
        hasta,
        dias: dias ? Number(dias) : undefined,
        clienteId,
        vendedorId,
      }),
    };
  }
}
