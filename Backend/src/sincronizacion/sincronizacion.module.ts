import { Roles } from "../common/guards";
import { RolUsuario } from "@prisma/client";
import { Controller, Get, Header, Injectable, Module } from "@nestjs/common";
import type { RevisionDatosDTO } from "@ambie/contrato";
import { PrismaService } from "../common/prisma.module";

@Injectable()
class SincronizacionService {
  private lectura?: Promise<RevisionDatosDTO>;
  private hasta = 0;
  constructor(private readonly prisma: PrismaService) {}
  obtener(): Promise<RevisionDatosDTO> {
    // Agrupa las lecturas simultáneas de revisión. Cada petición sigue pasando
    // por AuthGuard y su comprobación de sesión/revocación.
    if (!this.lectura || Date.now() >= this.hasta) {
      this.hasta = Date.now() + 250;
      this.lectura = this.prisma.versionCache.findUniqueOrThrow({ where: { id: "sincronizacion" } })
        .then((fila) => ({ revision: fila.version.toString() }))
        .catch((error: unknown) => { this.lectura = undefined; throw error; });
    }
    return this.lectura;
  }
}

@Roles(RolUsuario.ADMINISTRADOR, RolUsuario.VENDEDOR, RolUsuario.INVENTARIO)
@Controller("sincronizacion")
class SincronizacionController {
  constructor(private readonly servicio: SincronizacionService) {}
  @Get("revision")
  @Header("Cache-Control", "no-store")
  async revision() { return { data: await this.servicio.obtener() }; }
}

@Module({ controllers: [SincronizacionController], providers: [SincronizacionService] })
export class SincronizacionModule {}
