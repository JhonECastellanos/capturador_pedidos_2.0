import { Injectable, OnModuleInit, OnModuleDestroy, Global, Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TokensService } from "./tokens";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// Global: tanto el guard de autenticación como AuthService necesitan firmar
// y verificar tokens, y ambos se usan desde módulos que no importan PrismaModule.
@Global()
@Module({
  providers: [PrismaService, TokensService],
  exports: [PrismaService, TokensService],
})
export class PrismaModule {}
