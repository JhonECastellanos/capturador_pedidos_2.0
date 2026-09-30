import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { ErrorDominio } from "../common/errores";

export function esIpv4Publica(ip: string): boolean {
  const partes = ip.split(".").map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = partes;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
export function validarUrlProveedor(valor: string): URL {
  let url: URL;
  try { url = new URL(valor); } catch { throw new ErrorDominio("VALIDACION", "Escribe una URL HTTPS válida para el proveedor."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || (url.port && url.port !== "443")) throw new ErrorDominio("VALIDACION", "La API personalizada requiere HTTPS en puerto 443, sin credenciales ni parámetros en la URL.");
  return url;
}

export async function pedirProveedor(urlTexto: string, cabeceras: Record<string, string>, cuerpo?: unknown): Promise<unknown> {
  const url = validarUrlProveedor(urlTexto);
  const direcciones = await lookup(url.hostname, { family: 4, all: true }).catch(() => { throw new ErrorDominio("PROVEEDOR", "No se pudo resolver el proveedor.", 502); });
  if (!direcciones.length || direcciones.some(({ address }) => !esIpv4Publica(address))) throw new ErrorDominio("VALIDACION", "El proveedor debe usar una dirección pública. No se permiten redes internas.");
  const datos = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);
  return new Promise((resolve, reject) => {
    const fallo = (mensaje: string, status = 502) => new ErrorDominio("PROVEEDOR", mensaje, status);
    const req = request(url, {
      method: datos === undefined ? "GET" : "POST",
      headers: { ...cabeceras, "Content-Type": "application/json", ...(datos ? { "Content-Length": String(Buffer.byteLength(datos)) } : {}) },
      lookup: (_host, _opciones, callback) => callback(null, direcciones[0].address, 4),
    }, (respuesta) => {
      const buffers: Buffer[] = []; let bytes = 0;
      respuesta.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) req.destroy(fallo("La respuesta del proveedor supera el límite.")); else buffers.push(chunk); });
      respuesta.on("error", () => reject(fallo("Se interrumpió la respuesta del proveedor.")));
      respuesta.on("end", () => {
        if (!respuesta.statusCode || respuesta.statusCode < 200 || respuesta.statusCode >= 300) {
          reject(fallo(respuesta.statusCode === 429 ? "El proveedor alcanzó su cuota. Intenta más tarde o cambia de modelo." : "El proveedor rechazó la solicitud. Revisa su clave, modelo y disponibilidad.")); return;
        }
        try { resolve(JSON.parse(Buffer.concat(buffers).toString("utf8"))); } catch { reject(fallo("El proveedor no devolvió JSON válido.")); }
      });
    });
    const temporizador = setTimeout(() => req.destroy(fallo("El proveedor tardó demasiado. Intenta nuevamente.")), 15000);
    req.on("close", () => clearTimeout(temporizador));
    req.on("error", (error) => reject(error instanceof ErrorDominio ? error : fallo("No se pudo conectar con el proveedor.")));
    req.end(datos);
  });
}
