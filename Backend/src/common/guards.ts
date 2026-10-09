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

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
/** Restringe una ruta a ciertos roles: `@Roles(RolUsuario.ADMINISTRADOR)`. */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);

export interface RequestAutenticado {
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
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
    if (!token) throw new UnauthorizedException("No autenticado");

    // El token de acceso es un JWT firmado: se valida sin tocar la base.
    const claims = this.tokens.verificarAcceso(token);

    // La sesión sigue siendo la fuente de verdad para revocar un acceso.
    const sesion = await this.prisma.sesion.findUnique({
      where: { id: claims.sid },
      include: { usuario: true },
    });

    if (!sesion || sesion.revocadoEn || sesion.expiraEn < new Date()) {
      throw new UnauthorizedException("Sesión inválida o expirada");
    }
    if (!sesion.usuario.activo) {
      throw new UnauthorizedException("Este usuario se encuentra inactivo");
    }

    request.user = sesion.usuario;
    request.sessionId = sesion.id;
    request.expiraAccesoEn = new Date(claims.exp * 1000).toISOString();

    const roles = this.reflector.getAllAndOverride<RolUsuario[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(sesion.usuario.rol)) {
      throw new ForbiddenException("No tienes permiso para esta acción");
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
