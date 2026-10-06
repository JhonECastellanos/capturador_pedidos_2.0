import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { from, lastValueFrom } from "rxjs";
import { RequestAutenticado } from "./guards";
import { ErrorDominio } from "./errores";
import { PrismaService } from "./prisma.module";

const RECURSOS = new Set(["clientes", "productos", "pedidos", "abonos", "proveedores", "recepciones-compra", "gastos", "caja", "inventario", "cierres"]);

function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object") return `{${Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(",")}}`;
  return JSON.stringify(valor) ?? "null";
}

/** Documento, resultado y clave se confirman juntos, incluso si se pierde la respuesta. */
@Injectable()
export class GuardadoInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler) {
    const request = contexto.switchToHttp().getRequest<RequestAutenticado & { method: string; url: string; body?: unknown }>();
    const ruta = request.url.split("?")[0];
    const clave = request.headers?.["idempotency-key"];
    if (!request.user || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) || !RECURSOS.has(ruta.replace(/^\/api\/v1\//, "").split("/")[0]) || clave === undefined) return siguiente.handle();
    if (typeof clave !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clave)) throw new ErrorDominio("CLAVE_GUARDADO_INVALIDA", "La clave del guardado debe ser un UUID válido");
    const usuarioId = request.user.id;
    const destino = `${request.method} ${ruta}`;
    const huella = createHash("sha256").update(canonico(request.body)).digest("hex");
    return from(this.prisma.enTransaccion(async (tx) => {
      // El candado dura hasta COMMIT/ROLLBACK; otro proceso espera y relee.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guardado:${usuarioId}:${clave}`}))`;
      const anterior = await tx.escrituraConfirmada.findUnique({ where: { usuarioId_clave: { usuarioId, clave } } });
      if (anterior) {
        if (anterior.ruta !== destino || anterior.huella !== huella) throw new ErrorDominio("CLAVE_GUARDADO_REUTILIZADA", "Esta clave corresponde a otra operación. Revisa el formulario antes de guardar", 409);
        return anterior.respuesta;
      }
      const resultado: unknown = await lastValueFrom(siguiente.handle());
      const respuesta = JSON.parse(JSON.stringify(resultado)) as Prisma.InputJsonValue;
      await tx.escrituraConfirmada.create({ data: { usuarioId, clave, ruta: destino, huella, respuesta } });
      return respuesta;
    }));
  }
}
