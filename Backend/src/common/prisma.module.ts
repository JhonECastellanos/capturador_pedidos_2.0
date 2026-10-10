import { Injectable, OnModuleInit, OnModuleDestroy, Global, Module } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { TokensService } from "./tokens";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly transaccion = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor() {
    super();
    // Las escrituras HTTP protegidas comparten una transacción. Los servicios
    // conservan sus consultas y bloqueos; fuera de ella Prisma funciona igual.
    return new Proxy(this, {
      get: (cliente, propiedad) => {
        const tx = cliente.transaccion.getStore();
        if (tx && propiedad === "$transaction") {
          return (operaciones: ((actual: Prisma.TransactionClient) => Promise<unknown>) | Promise<unknown>[]) =>
            typeof operaciones === "function" ? operaciones(tx) : Promise.all(operaciones);
        }
        const origen = tx && propiedad in tx ? tx : cliente;
        const valor = Reflect.get(origen, propiedad);
        return typeof valor === "function" ? valor.bind(origen) : valor;
      },
    });
  }

  async enTransaccion<T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const actual = this.transaccion.getStore();
    if (actual) return trabajo(actual);
    return super.$transaction((tx) => this.transaccion.run(tx, () => trabajo(tx)), { maxWait: 10_000, timeout: 20_000 });
  }

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
