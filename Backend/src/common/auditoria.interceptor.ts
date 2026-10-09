import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { mergeMap } from "rxjs";
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
    return siguiente.handle().pipe(mergeMap(async (resultado: { data?: { id?: string } }) => {
      const ruta = request.url.split("?")[0].replace(/^\/api\/v1\//, "");
      try {
        await this.prisma.auditoriaEvento.create({ data: { entidadTipo: ruta.split("/")[0], entidadId: resultado.data?.id ?? ruta.split("/")[1] ?? "", accion: `${request.method} ${ruta}`, usuarioId: request.user!.id, requestId: request.id } });
      } catch { this.logger.error("No se pudo registrar el evento de auditoría posterior a la escritura"); }
      return resultado;
    }));
  }
}
