import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ConfiguracionAsistenteEsquema, type ConfiguracionAsistentePublica } from "@ambie/contrato";
import { ErrorDominio } from "../common/errores";
import { validarUrlProveedor } from "./red-proveedor";

@Injectable()
export class ConfiguracionAsistente {
  private escritura: Promise<unknown> = Promise.resolve();
  constructor(private readonly entorno: ConfigService) {}
  private get archivo() { return resolve(this.entorno.get<string>("ASISTENTE_CONFIG_DIR") || ".ambie-config", "asistente.enc"); }
  private llave() {
    const secreto = this.entorno.get<string>("ASISTENTE_CONFIG_SECRET") || this.entorno.get<string>("JWT_SECRET");
    if (!secreto || secreto.length < 32) throw new ErrorDominio("CONFIGURACION", "Configura un secreto de servidor de al menos 32 caracteres para guardar el asistente.", 503);
    return createHash("sha256").update(`ambie-asistente:${secreto}`).digest();
  }
  async leer() {
    let buffer: Buffer;
    try { buffer = await readFile(this.archivo); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ConfiguracionAsistenteEsquema.parse({});
      throw new ErrorDominio("CONFIGURACION", "No se pudo leer la configuración del asistente.", 503);
    }
    try {
      const descifrar = createDecipheriv("aes-256-gcm", this.llave(), buffer.subarray(0, 12));
      descifrar.setAuthTag(buffer.subarray(12, 28));
      return ConfiguracionAsistenteEsquema.parse(JSON.parse(Buffer.concat([descifrar.update(buffer.subarray(28)), descifrar.final()]).toString("utf8")));
    } catch { throw new ErrorDominio("CONFIGURACION", "No se pudo descifrar la configuración. Revisa el secreto del servidor.", 503); }
  }
  async publica(): Promise<ConfiguracionAsistentePublica> {
    const { clave, borrarClave: _borrar, ...resto } = await this.leer();
    return { ...resto, tieneClave: !!clave };
  }
  guardar(entrada: unknown): Promise<ConfiguracionAsistentePublica> {
    const tarea = this.escritura.then(async () => {
      const datos = ConfiguracionAsistenteEsquema.parse(entrada);
      if (datos.proveedor === "gemini") datos.modelo = datos.modelo.replace(/^models\//, "");
      if (datos.proveedor === "compatible") validarUrlProveedor(datos.urlBase);
      const anterior = await this.leer();
      const mismaConexion = anterior.proveedor === datos.proveedor && anterior.urlBase === datos.urlBase;
      datos.clave = datos.borrarClave ? undefined : datos.clave || (mismaConexion ? anterior.clave : undefined);
      datos.borrarClave = false;
      const iv = randomBytes(12);
      const cifrar = createCipheriv("aes-256-gcm", this.llave(), iv);
      const contenido = Buffer.concat([cifrar.update(JSON.stringify(datos), "utf8"), cifrar.final()]);
      const archivo = this.archivo;
      await mkdir(dirname(archivo), { recursive: true, mode: 0o700 });
      const temporal = `${archivo}.tmp`;
      await writeFile(temporal, Buffer.concat([iv, cifrar.getAuthTag(), contenido]), { mode: 0o600 });
      await rename(temporal, archivo);
      return this.publica();
    });
    this.escritura = tarea.catch(() => undefined);
    return tarea;
  }
}
