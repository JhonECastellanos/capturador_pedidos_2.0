import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { Public, UsuarioActual, RequestAutenticado, COOKIE_ACCESO, COOKIE_REFRESH } from "../common/guards";
import { TokensService } from "../common/tokens";
import { ErrorDominio } from "../common/errores";
import { Usuario } from "@prisma/client";

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const BootstrapSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefrescarSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const LogoutSchema = z.object({
  todas: z.boolean().optional(),
});

const COOKIE_OPCIONES = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
} as const;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("bootstrap")
  async bootstrap(@Body() body: unknown) {
    const datos = BootstrapSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Correo inválido o contraseña menor a 8 caracteres");
    return { data: await this.auth.bootstrap(datos.data.email, datos.data.password) };
  }

  @Public()
  @Post("login")
  // Entrar es una acción, no la creación de un recurso: 200 en vez del 201
  // que Nest responde por defecto a los POST.
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    // `passthrough` deja que Nest siga enviando el valor retornado; sin el
    // decorador, Nest no inyecta la respuesta y `setCookie` falla.
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const datos = LoginSchema.safeParse(body);
    if (!datos.success) throw new ErrorDominio("VALIDACION", "Ingresa usuario y contraseña");

    const emitido = await this.auth.login(datos.data.identifier, datos.data.password);

    // El navegador usa cookies HttpOnly; las integraciones leen
    // los tokens del cuerpo y envían `Authorization: Bearer`.
    this.ponerCookies(reply, emitido.accessToken, emitido.refreshToken);

    return {
      data: {
        usuario: emitido.usuario,
        accessToken: emitido.accessToken,
        refreshToken: emitido.refreshToken,
        expiraEn: emitido.expiraEn,
      },
    };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refrescar(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const datos = RefrescarSchema.safeParse(body ?? {});
    // El refresh puede venir en el cuerpo o en la cookie.
    const refreshToken = datos.success && datos.data.refreshToken
      ? datos.data.refreshToken
      : (req as unknown as RequestAutenticado).cookies?.[COOKIE_REFRESH];
    if (!refreshToken) throw new ErrorDominio("REFRESH_INVALIDO", "No hay sesión para renovar", 401);

    const emitido = await this.auth.refrescar(refreshToken);
    this.ponerCookies(reply, emitido.accessToken, emitido.refreshToken);

    return {
      data: {
        usuario: emitido.usuario,
        accessToken: emitido.accessToken,
        refreshToken: emitido.refreshToken,
        expiraEn: emitido.expiraEn,
      },
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @UsuarioActual() usuario: Usuario,
  ) {
    const request = req as unknown as RequestAutenticado;
    const datos = LogoutSchema.safeParse(body ?? {});
    const todas = datos.success ? Boolean(datos.data.todas) : false;
    if (request.sessionId) await this.auth.logout(request.sessionId, usuario.id, todas);

    reply.clearCookie(COOKIE_ACCESO, { path: "/" });
    reply.clearCookie(COOKIE_REFRESH, { path: "/" });
    return { data: { ok: true } };
  }

  @Get("me")
  async me(@UsuarioActual() usuario: Usuario, @Req() req: FastifyRequest) {
    return { data: { ...await this.auth.me(usuario.id), expiraEn: (req as unknown as RequestAutenticado).expiraAccesoEn } };
  }

  private ponerCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
    reply.setCookie(COOKIE_ACCESO, accessToken, {
      ...COOKIE_OPCIONES,
      maxAge: TokensService.ttlAcceso(),
    });
    reply.setCookie(COOKIE_REFRESH, refreshToken, {
      ...COOKIE_OPCIONES,
      maxAge: TokensService.ttlRefresh() / 1000,
    });
  }
}
