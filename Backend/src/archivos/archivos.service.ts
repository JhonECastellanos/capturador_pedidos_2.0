import { Injectable } from "@nestjs/common";
import { Client } from "minio";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";

@Injectable()
export class ArchivosService {
  constructor(private readonly prisma: PrismaService) {}
  private cliente() {
    return new Client({ endPoint: process.env.MINIO_ENDPOINT || "minio", port: Number(process.env.MINIO_PORT || 9000), useSSL: process.env.MINIO_USE_SSL === "true", accessKey: process.env.MINIO_ACCESS_KEY || "", secretKey: process.env.MINIO_SECRET_KEY || "" });
  }
  private bucket = process.env.MINIO_BUCKET || "ambie-archivos";
  async referencias() {
    const archivos = await this.prisma.archivoAdjunto.findMany({ where: { eliminadoEn: null }, orderBy: { creadoEn: "desc" }, select: { id: true, productoId: true, pedidoId: true, nombre: true } });
    const vistos = new Set<string>();
    return archivos.filter((a) => { const clave = `${a.productoId ?? ""}:${a.pedidoId ?? ""}`; if (vistos.has(clave)) return false; vistos.add(clave); return true; });
  }
  async subir(tipo: "producto" | "pedido", id: string, datos: { nombre: string; dataUrl: string }, usuarioId: string) {
    const entidad = tipo === "producto" ? await this.prisma.producto.findUnique({ where: { id } }) : await this.prisma.pedido.findUnique({ where: { id } });
    if (!entidad) throw new ErrorDominio("NO_ENCONTRADO", "No se encontró el destino del archivo", 404);
    const match = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(datos.dataUrl);
    if (!match || (tipo === "producto" && match[1] === "application/pdf")) throw new ErrorDominio("ARCHIVO_INVALIDO", "Usa una imagen JPG, PNG, WebP, GIF o un comprobante PDF");
    const contenido = Buffer.from(match[2], "base64");
    if (!contenido.length || contenido.length > 5 * 1024 * 1024) throw new ErrorDominio("ARCHIVO_GRANDE", "El archivo debe pesar hasta 5 MB");
    const firmas: Record<string, boolean> = {
      "image/jpeg": contenido.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
      "image/png": contenido.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      "image/webp": contenido.toString("ascii", 0, 4) === "RIFF" && contenido.toString("ascii", 8, 12) === "WEBP",
      "image/gif": /^GIF8[79]a$/.test(contenido.toString("ascii", 0, 6)),
      "application/pdf": contenido.toString("ascii", 0, 5) === "%PDF-",
    };
    if (!firmas[match[1]]) throw new ErrorDominio("ARCHIVO_INVALIDO", "El contenido no corresponde al tipo de archivo");
    const storageKey = `${tipo}/${id}/${randomUUID()}`;
    const cliente = this.cliente();
    try {
      if (!await cliente.bucketExists(this.bucket)) {
        try { await cliente.makeBucket(this.bucket); } catch (e) { if (!await cliente.bucketExists(this.bucket)) throw e; }
      }
      await cliente.putObject(this.bucket, storageKey, contenido, contenido.length, { "Content-Type": match[1] });
    } catch { throw new ErrorDominio("ALMACENAMIENTO_NO_DISPONIBLE", "No se pudo guardar el archivo. Revisa el almacenamiento del servidor", 503); }
    return this.prisma.$transaction(async (tx) => {
      const archivo = await tx.archivoAdjunto.create({ data: { nombre: datos.nombre.replace(/^.*[\\/]/, "").slice(0, 200), mimeType: match[1], storageKey, tamano: contenido.length, sha256: createHash("sha256").update(contenido).digest("hex"), usuarioId, productoId: tipo === "producto" ? id : null, pedidoId: tipo === "pedido" ? id : null } });
      if (tipo === "pedido") await tx.pedido.update({ where: { id }, data: { comprobantePagoAdjuntoId: archivo.id } });
      return { id: archivo.id, nombre: archivo.nombre };
    });
  }
  async descargar(id: string) {
    const archivo = await this.prisma.archivoAdjunto.findFirst({ where: { id, eliminadoEn: null } });
    if (!archivo) throw new ErrorDominio("NO_ENCONTRADO", "Archivo no encontrado", 404);
    try { return { archivo, stream: await this.cliente().getObject(this.bucket, archivo.storageKey) }; }
    catch { throw new ErrorDominio("ALMACENAMIENTO_NO_DISPONIBLE", "No se pudo descargar el archivo", 503); }
  }
}
