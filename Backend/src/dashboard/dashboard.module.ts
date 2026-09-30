import { Module } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { CacheModule, type CacheModuleOptions } from "@nestjs/cache-manager";
import { createKeyv } from "@keyv/redis";
import { CacheTablero } from "./cache.service";

@Module({
  imports: [CacheModule.registerAsync({ useFactory: (): CacheModuleOptions => {
    if (!process.env.CACHE_REDIS_URL) return { ttl: 300_000, max: 100 };
    const store = createKeyv({ url: process.env.CACHE_REDIS_URL, disableOfflineQueue: true, socket: { connectTimeout: 300, reconnectStrategy: (reintentos: number) => Math.min(1000, 100 + reintentos * 100) } }, { namespace: "ambie:dashboard", throwOnErrors: true, throwOnConnectError: true, connectionTimeout: 300 });
    store.on("error", () => {});
    return { stores: [store], ttl: 300_000 };
  } })],
  controllers: [DashboardController],
  providers: [DashboardService, CacheTablero],
})
export class DashboardModule {}
