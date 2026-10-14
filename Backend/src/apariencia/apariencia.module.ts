import { Module } from "@nestjs/common";
import { AparienciaController } from "./apariencia.controller";
import { AparienciaService } from "./apariencia.service";
@Module({ controllers: [AparienciaController], providers: [AparienciaService] })
export class AparienciaModule {}
