import { Module } from "@nestjs/common";
import { AsistenteController } from "./asistente.controller";
import { AsistenteService } from "./asistente.service";
import { ConfiguracionAsistente } from "./configuracion-asistente";
import { VozService } from "./voz.service";

@Module({ controllers: [AsistenteController], providers: [AsistenteService, ConfiguracionAsistente, VozService] })
export class AsistenteModule {}
