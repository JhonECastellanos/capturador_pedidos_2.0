import { Module } from "@nestjs/common";
import { AgentesController } from "./agentes.controller";
import { AgentesService } from "./agentes.service";
import { ChatService } from "./chat.service";
import { ProductosModule } from "../productos/productos.module";
import { PedidosModule } from "../pedidos/pedidos.module";
import { ComprasModule } from "../compras/compras.module";
import { DashboardModule } from "../dashboard/dashboard.module";
@Module({ imports: [ProductosModule, PedidosModule, ComprasModule, DashboardModule], controllers: [AgentesController], providers: [AgentesService, ChatService] })
export class AgentesModule {}
