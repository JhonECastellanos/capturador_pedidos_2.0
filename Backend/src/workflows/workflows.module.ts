import { Module } from "@nestjs/common";
import { AgentesModule } from "../agentes/agentes.module";
import { WorkflowsController, ComercialController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
@Module({ imports: [AgentesModule], controllers: [WorkflowsController, ComercialController], providers: [WorkflowsService] })
export class WorkflowsModule {}
