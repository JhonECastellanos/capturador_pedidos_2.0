import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { ErrorDominio } from "./errores";

/** Claims del token de acceso. El refresh es opaco y vive en la base de datos. */
export interface ClaimsAcceso {
  /** id del usuario */
  sub: string;
  /** código legible del usuario (USR-0001) */
  cod: string;
  /** rol: administrador | vendedor */
  rol: string;
  /** id de la sesión, para poder revocarla */
  sid: string;
  /** emisor y audiencia, para invalidar tokens de otros sistemas */
  iss: string;
  aud: string;
}

const ACCESS_TTL_SEGUNDOS = 15 * 60; // 15 minutos
const REFRESH_TTL_DIAS = 7;

@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  /** Secreto de firma. Se lee del entorno y nunca se expone. */
  static get secreto(): string {
    const secreto = process.env.JWT_SECRET;
    if (!secreto || secreto.length < 32) {
      throw new Error(
        "Falta JWT_SECRET en el entorno. Debe tener al menos 32 caracteres. " +
          "Genera uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
      );
    }
    return secreto;
  }

  static get emisor(): string {
    return process.env.JWT_ISSUER ?? "ambie-api";
  }

  static get audiencia(): string {
    return process.env.JWT_AUDIENCE ?? "ambie";
  }

  /**
   * Access token de vida corta: el navegador lo renueva con el refresh.
   * Lleva un `jti` único para que dos emisiones seguidas nunca coincidan
   * (si no, renovar dentro del mismo segundo devolvería el mismo token).
   */
  firmarAcceso(claims: Omit<ClaimsAcceso, "iss" | "aud">): string {
    return this.jwt.sign(
      { cod: claims.cod, rol: claims.rol, sid: claims.sid, jti: randomUUID() },
      {
        secret: TokensService.secreto,
        expiresIn: TokensService.ttlAcceso(),
        issuer: TokensService.emisor,
        audience: TokensService.audiencia,
        subject: claims.sub,
      },
    );
  }

  /** Valida firma, emisor, audiencia y expiración. */
  verificarAcceso(token: string): ClaimsAcceso {
    try {
      const payload = this.jwt.verify<ClaimsAcceso>(token, {
        secret: TokensService.secreto,
        issuer: TokensService.emisor,
        audience: TokensService.audiencia,
      });
      return payload;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (mensaje.includes("expired")) {
        throw new ErrorDominio("TOKEN_EXPIRADO", "El token expiró", 401);
      }
      throw new ErrorDominio("TOKEN_INVALIDO", "El token no es válido", 401);
    }
  }

  /** El refresh se guarda hasheado en la tabla `sesiones`. */
  static ttlAcceso(): number {
    return Number(process.env.JWT_ACCESS_TTL_SEGUNDOS ?? ACCESS_TTL_SEGUNDOS);
  }

  static ttlRefresh(): number {
    const dias = Number(process.env.JWT_REFRESH_TTL_DIAS ?? REFRESH_TTL_DIAS);
    return dias * 24 * 60 * 60 * 1000;
  }

  /** Fecha de expiración del access token, para informar al cliente. */
  expiraAcceso(): Date {
    return new Date(Date.now() + TokensService.ttlAcceso() * 1000);
  }
}
