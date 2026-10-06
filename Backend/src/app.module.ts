import { Module } from "@nestjs/common";
import { SincronizacionModule } from "./sincronizacion/sincronizacion.module";
import { ConfigModule } from "@nestjs/config";
import { AsistenteModule } from "./asistente/asistente.module";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuditoriaModule } from "./auditoria/auditoria.module";
import { AuditoriaInterceptor } from "./common/auditoria.interceptor";
import { GuardadoInterceptor } from "./common/guardado.interceptor";
import { ArchivosModule } from "./archivos/archivos.module";
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
    SincronizacionModule,
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
    AuditoriaModule,
    ArchivosModule,
    AsistenteModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_INTERCEPTOR, useClass: GuardadoInterceptor }, { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor }],
})
export class AppModule {}
