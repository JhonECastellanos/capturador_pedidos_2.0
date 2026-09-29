import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module";
import { Public } from "../common/guards";

/**
 * Sonda de salud del servicio.
 *
 * Es pública porque el orquestador (Docker, Kubernetes o un balanceador) la
 * consulta sin credenciales, y solo revela si el proceso responde y si la base
 * de datos acepta conexiones. No devuelve datos del negocio.
 */
@Controller("salud")
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async estado() {
    const inicio = Date.now();
    let baseDeDatos: "ok" | "error" = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      baseDeDatos = "error";
    }

    return {
      data: {
        estado: baseDeDatos === "ok" ? "ok" : "degradado",
        version: process.env.APP_VERSION ?? "0.1.0",
        entorno: process.env.NODE_ENV ?? "development",
        baseDeDatos,
        latenciaMs: Date.now() - inicio,
        fecha: new Date().toISOString(),
      },
    };
  }
}
