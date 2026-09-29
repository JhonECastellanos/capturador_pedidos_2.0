import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./common/prisma.module";
import { AuthGuard } from "./common/guards";
import { AuthModule } from "./auth/auth.module";
import { CatalogosModule } from "./catalogos/catalogos.module";
import { ClientesModule } from "./clientes/clientes.module";
import { ProductosModule } from "./productos/productos.module";
import { PedidosModule } from "./pedidos/pedidos.module";
import { PagosModule } from "./pagos/pagos.module";
import { InventarioModule } from "./inventario/inventario.module";
import { ComprasModule } from "./compras/compras.module";
import { CajaModule } from "./caja/caja.module";
import { UsuariosModule } from "./usuarios/usuarios.module";
import { CierresModule } from "./cierres/cierres.module";
import { DashboardModule } from "./dashboard/dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global: el guard de autenticación firma y verifica tokens desde
    // cualquier módulo, no solo desde AuthModule.
    JwtModule.register({ global: true }),
    PrismaModule,
    AuthModule,
    CatalogosModule,
    ClientesModule,
    ProductosModule,
    PedidosModule,
    PagosModule,
    InventarioModule,
    ComprasModule,
    CajaModule,
    UsuariosModule,
    CierresModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
