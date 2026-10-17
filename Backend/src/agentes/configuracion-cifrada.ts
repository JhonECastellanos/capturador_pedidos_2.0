import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ErrorDominio } from "../common/errores";
import { TokensService } from "../common/tokens";
function claveConfiguracion(prefijo = "abinova") {
  const secreto = process.env.AGENT_CONFIG_SECRET || TokensService.secreto;
  if (secreto.length < 32) throw new ErrorDominio("CONFIGURACION_CLAVE", "La clave privada del servidor debe tener al menos 32 caracteres", 503);
  return createHash("sha256").update(`${prefijo}:agentes:${secreto}`).digest();
}
export function cifrar(secretos: Record<string, string>) {
  const iv = randomBytes(12), key = claveConfiguracion();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secretos), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString("base64")).join(".");
}
export function descifrar(datos: string): Record<string, string> {
  const [iv, tag, texto] = datos.split(".").map(s => Buffer.from(s, "base64"));
  // El cambio de marca conserva las conexiones cifradas de instalaciones anteriores.
  for (const prefijo of ["abinova", "ambie"]) {
    try { const decipher = createDecipheriv("aes-256-gcm", claveConfiguracion(prefijo), iv); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(texto), decipher.final()]).toString("utf8")); }
    catch { /* Probar el contexto anterior; nunca reemplazar una clave guardada. */ }
  }
  throw new ErrorDominio("CONFIGURACION_CLAVE", "No se pudo abrir la configuración protegida. Revisa la clave del servidor", 503);
}
