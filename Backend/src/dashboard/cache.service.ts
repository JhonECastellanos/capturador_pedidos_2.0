import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";

@Injectable()
export class CacheTablero {
  readonly ttl = 300_000;
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}
  private async limitar<T>(operacion: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operacion, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("CACHE_TIMEOUT")), 400); timer.unref(); })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async obtener<T>(clave: string): Promise<T | undefined> {
    try { return await this.limitar(this.cache.get<T>(clave)); } catch { return undefined; }
  }
  async guardar<T>(clave: string, valor: T): Promise<void> {
    try { await this.limitar(this.cache.set(clave, valor, this.ttl)); } catch { /* Redis es opcional para la disponibilidad de PostgreSQL. */ }
  }
}
