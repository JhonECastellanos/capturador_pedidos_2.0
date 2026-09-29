import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { generarToken, hashToken, ahoraISO } from "../common/crypto";
import { TokensService } from "../common/tokens";
import { siguienteCodigo } from "../common/consecutivos";
import { RolUsuario } from "@prisma/client";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async permisosDe(usuarioId: string): Promise<string[]> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) return [];
    const vinculos = await this.prisma.rolPermiso.findMany({
      where: { rol: { codigo: usuario.rol } },
      include: { permiso: true },
    });
    return vinculos.map((v) => v.permiso.codigo);
  }

  async bootstrap(email: string, password: string) {
    const existente = await this.prisma.usuario.findFirst({
      where: { rol: RolUsuario.ADMINISTRADOR },
    });
    if (existente) throw new ErrorDominio("BOOTSTRAP_YA_EJECUTADO", "Ya existe un administrador", 409);

    const passwordHash = await argon2.hash(password);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigo(tx, "USR");
      return tx.usuario.create({
        data: {
          codigo,
          nombre: "Perfil administrador",
          email,
          passwordHash,
          rol: RolUsuario.ADMINISTRADOR,
          activo: true,
        },
      });
    });

    return this.dtoUsuario(usuario);
  }

  /**
   * Valida las credenciales y crea la sesión.
   * Devuelve el access token (JWT corto), el refresh token (opaco y largo)
   * y los datos del usuario.
   */
  async login(identificador: string, password: string) {
    const usuario = await this.buscarPorIdentificador(identificador);

    if (!usuario || !usuario.activo) {
      throw new ErrorDominio("CREDENCIALES_INVALIDAS", "Usuario no encontrado o inactivo", 401);
    }

    const valido = await argon2.verify(usuario.passwordHash, password);
    if (!valido) {
      throw new ErrorDominio("CREDENCIALES_INVALIDAS", "Contraseña incorrecta", 401);
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAccesoEn: new Date(ahoraISO()) },
    });

    const emitido = await this.emitirTokens(usuario);
    return { ...emitido, usuario: await this.dtoUsuario(usuario) };
  }

  /**
   * Renueva el access token a partir de un refresh token válido.
   * El refresh se rota: la sesión anterior queda revocada.
   */
  async refrescar(refreshToken: string) {
    const sesion = await this.prisma.sesion.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { usuario: true },
    });

    if (!sesion || sesion.revocadoEn || sesion.expiraEn < new Date()) {
      throw new ErrorDominio("REFRESH_INVALIDO", "La sesión expiró, vuelve a iniciar sesión", 401);
    }
    if (!sesion.usuario.activo) {
      throw new ErrorDominio("USUARIO_INACTIVO", "Este usuario se encuentra inactivo", 401);
    }

    const emitido = await this.emitirTokens(sesion.usuario, sesion.id);

    await this.prisma.sesion.update({
      where: { id: sesion.id },
      data: { revocadoEn: new Date(ahoraISO()) },
    });

    return { ...emitido, usuario: await this.dtoUsuario(sesion.usuario) };
  }

  /** Cierra la sesión actual. Si es `todas`, cierra todas las del usuario. */
  async logout(sessionId: string, usuarioId: string, todas = false) {
    await this.prisma.sesion.updateMany({
      where: todas ? { usuarioId, revocadoEn: null } : { id: sessionId },
      data: { revocadoEn: new Date(ahoraISO()) },
    });
  }

  async me(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new ErrorDominio("NO_AUTENTICADO", "Usuario no encontrado", 401);
    return this.dtoUsuario(usuario);
  }

  /**
   * Busca por correo, código de usuario o nombre.
   * El mismo endpoint sirve al administrador y al vendedor.
   */
  private async buscarPorIdentificador(identificador: string) {
    const texto = identificador.trim();
    if (!texto) return null;
    return this.prisma.usuario.findFirst({
      where: {
        OR: [
          { email: { equals: texto, mode: "insensitive" } },
          { codigo: { equals: texto, mode: "insensitive" } },
          { nombre: { contains: texto, mode: "insensitive" } },
        ],
      },
    });
  }

  /**
   * Crea los tokens de una sesión.
   * El refresh se guarda solo hasheado: si alguien lee la base de datos,
   * no puede reconstruir el token original.
   */
  private async emitirTokens(
    usuario: { id: string; codigo: string; rol: RolUsuario },
    sesionId?: string,
  ) {
    const refresh = generarToken();
    const sesion = sesionId
      ? await this.prisma.sesion.update({
          where: { id: sesionId },
          data: {
            tokenHash: hashToken(refresh),
            expiraEn: new Date(Date.now() + TokensService.ttlRefresh()),
          },
        })
      : await this.prisma.sesion.create({
          data: {
            usuarioId: usuario.id,
            tokenHash: hashToken(refresh),
            expiraEn: new Date(Date.now() + TokensService.ttlRefresh()),
          },
        });

    const accessToken = this.tokens.firmarAcceso({
      sub: usuario.id,
      cod: usuario.codigo,
      rol: usuario.rol,
      sid: sesion.id,
    });

    return {
      accessToken,
      refreshToken: refresh,
      expiraEn: this.tokens.expiraAcceso().toISOString(),
      sessionId: sesion.id,
    };
  }

  private async dtoUsuario(usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: RolUsuario;
    activo: boolean;
    codigo: string;
    creadoEn?: Date;
    ultimoAccesoEn?: Date | null;
  }) {
    const permisos = await this.permisosDe(usuario.id);
    return {
      id: usuario.id,
      codigo: usuario.codigo,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      permisos,
      activo: usuario.activo,
      creadoEn: usuario.creadoEn ?? null,
      ultimoAccesoEn: usuario.ultimoAccesoEn ?? null,
    };
  }
}
