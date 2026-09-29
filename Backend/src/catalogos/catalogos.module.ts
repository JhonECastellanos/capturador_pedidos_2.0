import { Module } from "@nestjs/common";
import { CatalogosController } from "./catalogos.controller";
import { SaludController } from "./salud.controller";

@Module({
  controllers: [CatalogosController, SaludController],
})
export class CatalogosModule {}
