import { Module } from "@nestjs/common";
import { CajaService } from "./caja.service";
import { CajaController } from "./caja.controller";

@Module({
  controllers: [CajaController],
  providers: [CajaService],
})
export class CajaModule {}
