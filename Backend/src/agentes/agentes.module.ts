import { Module } from "@nestjs/common";
import { AgentesController } from "./agentes.controller";
import { AgentesService } from "./agentes.service";
@Module({ controllers: [AgentesController], providers: [AgentesService] })
export class AgentesModule {}
