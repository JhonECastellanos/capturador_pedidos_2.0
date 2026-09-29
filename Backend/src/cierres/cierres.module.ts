import { Module } from "@nestjs/common";
import { CierresService } from "./cierres.service";
import { CierresController } from "./cierres.controller";

@Module({
  controllers: [CierresController],
  providers: [CierresService],
})
export class CierresModule {}
