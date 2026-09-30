import { Module } from "@nestjs/common";
import { ArchivosController } from "./archivos.controller";
import { ArchivosService } from "./archivos.service";
@Module({ controllers: [ArchivosController], providers: [ArchivosService] })
export class ArchivosModule {}
