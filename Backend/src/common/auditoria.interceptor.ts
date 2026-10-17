import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { from, lastValueFrom } from "rxjs";
import { PrismaService } from "./prisma.module";
import { RequestAutenticado } from "./guards";

/** Registra metadatos de escrituras exitosas. Nunca guarda cuerpos, contraseñas ni tokens. */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}
  intercept(contexto: ExecutionContext, siguiente: CallHandler) {
    const request = contexto.switchToHttp().getRequest<RequestAutenticado & { method: string; url: string; id?: string }>();
    if (!request.user || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) || request.url.includes("/auth/")) return siguiente.handle();
    const registrar = async () => {
      const resultado: { data?: { id?: string } } = await lastValueFrom(siguiente.handle());
      const ruta = request.url.split("?")[0].replace(/^\/api\/v1\//, "");
      const esPrueba = !!request.user!.esSistema;
      const empresaId = /^workflows\/empresas\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(ruta)?.[1] ?? process.env.WORKFLOW_TENANT_ID ?? "principal";
      try {
        await this.prisma.auditoriaEvento.create({ data: { entidadTipo: ruta.split("/")[0], entidadId: resultado?.data?.id ?? ruta.split("/")[1] ?? "", accion: `${request.method} ${ruta}`, usuarioId: request.user!.id, requestId: request.id, esPrueba, empresaId, usuarioObjetivoId: request.usuarioObjetivoId } });
      } catch (error) {
        if (esPrueba) throw error;
        this.logger.error("No se pudo registrar el evento de auditoría posterior a la escritura");
      }
      return resultado;
    };
    // El actor sigue siendo system: nunca se atribuye una operación suya al cliente.
    // Las escrituras del negocio y la marca de prueba se confirman juntas.
    const recurso = request.url.split("?")[0].replace(/^\/api\/v1\//, "").split("/")[0];
    const transaccional = new Set(["clientes", "productos", "pedidos", "abonos", "proveedores", "recepciones-compra", "gastos", "caja", "inventario", "cierres", "usuarios", "apariencia"]);
    return from((request.user.esSistema && transaccional.has(recurso) ? this.prisma.enTransaccion(registrar) : registrar()).then(resultado => {
      if (request.user!.esSistema) this.logger.log(JSON.stringify({ tipo: "operacion_maestro", esPrueba: true, empresaId: process.env.WORKFLOW_TENANT_ID ?? "principal", usuarioId: request.user!.id, usuarioObjetivoId: request.usuarioObjetivoId ?? null, requestId: request.id, accion: `${request.method} ${request.url.split("?")[0]}` }));
      return resultado;
    }));
  }
}
