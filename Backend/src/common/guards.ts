import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Usuario, RolUsuario } from "@prisma/client";
import { PrismaService } from "./prisma.module";
import { hashToken } from "./crypto";
import { TokensService } from "./tokens";
import { ErrorDominio } from "./errores";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** La consulta de sesión puede responder sin usuario cuando no hay token. */
export const SesionOpcional = () => SetMetadata("sesionOpcional", true);

export const ROLES_KEY = "roles";
/** Restringe una ruta a ciertos roles: `@Roles(RolUsuario.ADMINISTRADOR)`. */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);

export interface RequestAutenticado {
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
  user?: Usuario;
  sessionId?: string;
  expiraAccesoEn?: string;
}

export const UsuarioActual = createParamDecorator((_data: unknown, ctx: ExecutionContext): Usuario => {
  const request = ctx.switchToHttp().getRequest<RequestAutenticado>();
  return request.user as Usuario;
});

/** Cookie de acceso que usa el navegador. */
export const COOKIE_ACCESO = "ambie_access";
/** Cookie de refresco que usa el navegador para renovar la sesión. */
export const COOKIE_REFRESH = "ambie_refresh";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;

    const request = context.switchToHttp().getRequest<RequestAutenticado>();
    const token = this.extraerToken(request);
    const opcional = this.reflector.getAllAndOverride<boolean>("sesionOpcional", [context.getHandler(), context.getClass()]);
    if (!token && opcional) return true;
    if (!token) throw new UnauthorizedException("No autenticado");

    // El token de acceso es un JWT firmado: se valida sin tocar la base.
    let claims: ReturnType<TokensService["verificarAcceso"]>;
    try { claims = this.tokens.verificarAcceso(token); }
    catch (error) {
      if (opcional && error instanceof ErrorDominio && error.getStatus() === 401) return true;
      throw error;
    }

    // La sesión sigue siendo la fuente de verdad para revocar un acceso.
    const sesion = await this.prisma.sesion.findUnique({
      where: { id: claims.sid },
      include: { usuario: true },
    });

    if (!sesion || sesion.revocadoEn || sesion.expiraEn <= new Date()) {
      if (opcional) return true;
      throw new UnauthorizedException("Sesión inválida o expirada");
    }
    if (!sesion.usuario.activo) {
      if (opcional) return true;
      throw new UnauthorizedException("Este usuario se encuentra inactivo");
    }

    request.user = sesion.usuario;
    request.sessionId = sesion.id;
    request.expiraAccesoEn = new Date(claims.exp * 1000).toISOString();

    const roles = this.reflector.getAllAndOverride<RolUsuario[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (sesion.usuario.rol === RolUsuario.INVENTARIO && !roles?.includes(RolUsuario.INVENTARIO)) throw new ForbiddenException("Este acceso permite únicamente realizar conteos de inventario");
    if (roles && roles.length > 0 && !roles.includes(sesion.usuario.rol)) {
      throw new ForbiddenException("No tienes permiso para esta acción");
    }

    if (!sesion.usuario.esSistema) {
      const modulo = request.url?.split("?")[0].split("/")[3];
      const permiso = ({ usuarios: "usuarios", clientes: "clientes", pedidos: "pedidos", pagos: "cobros", inventario: "inventario", compras: "inventario", "recepciones-compra": "inventario", proveedores: "inventario", gastos: "caja", abonos: "cobros", caja: "caja", cierres: "cierre-diario" } as Record<string, string>)[modulo ?? ""] ?? (modulo === "productos" && request.method !== "GET" ? "inventario" : undefined);
      const requerido = /\/(?:pagos|abonos)(?:\?|$)/.test(request.url ?? "") ? "cobros" : permiso;
      if (requerido && sesion.usuario.permisosDenegados.includes(requerido)) throw new ForbiddenException("Tu administrador deshabilitó este permiso");
    }

    return true;
  }

  /**
   * Acepta el token de dos formas para servir al navegador y a las integraciones
   * con el mismo backend:
   * - cookie `ambie_access` (web, HttpOnly, no accesible desde JavaScript)
   * - cabecera `Authorization: Bearer <token>` (integraciones)
   */
  private extraerToken(request: RequestAutenticado): string | null {
    const autorizacion = request.headers?.authorization;
    if (typeof autorizacion === "string" && autorizacion.toLowerCase().startsWith("bearer ")) {
      const token = autorizacion.slice(7).trim();
      if (token) return token;
    }
    return request.cookies?.[COOKIE_ACCESO] ?? null;
  }
}
