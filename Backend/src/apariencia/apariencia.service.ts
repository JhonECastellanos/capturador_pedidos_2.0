import { Injectable } from "@nestjs/common";
import { APARIENCIA_INICIAL, AparienciaEsquema, type Apariencia } from "@synchronic-jo/contrato";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
@Injectable()
export class AparienciaService {
  constructor(private readonly prisma: PrismaService) {}
  async obtener(): Promise<Apariencia> {
    const registro = await this.prisma.configuracionVisual.findUnique({ where: { id: "principal" } });
    return registro ? AparienciaEsquema.parse(registro.configuracion) : APARIENCIA_INICIAL;
  }
  async guardar(configuracion: Apariencia): Promise<Apariencia> {
    if (configuracion.imagen) {
      const [tipo, base64] = configuracion.imagen.split(";base64,");
      const bytes = Buffer.from(base64, "base64");
      const valida = tipo === "data:image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : tipo === "data:image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      if (!valida || bytes.length > 300 * 1024) throw new ErrorDominio("IMAGEN_INVALIDA", "Usa una imagen válida de hasta 300 KB");
    }
    await this.prisma.configuracionVisual.upsert({ where: { id: "principal" }, create: { configuracion: configuracion as Prisma.InputJsonValue }, update: { configuracion: configuracion as Prisma.InputJsonValue } });
    return configuracion;
  }
}
