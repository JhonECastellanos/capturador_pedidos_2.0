import { Module } from "@nestjs/common";
import { CierresService } from "./cierres.service";
import { CierresController } from "./cierres.controller";
import { PedidosModule } from "../pedidos/pedidos.module";

@Module({
  imports: [PedidosModule],
  controllers: [CierresController],
  providers: [CierresService],
})
export class CierresModule {}
