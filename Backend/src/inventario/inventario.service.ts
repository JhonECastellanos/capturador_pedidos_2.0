import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { hoyLocal } from "../common/crypto";
import { EstadoConteo, TipoConteo, TipoMovimientoInventario } from "@prisma/client";

const IniciarConteoSchema = z.object({
  tipo: z.enum(["general", "aleatorio"]),
  cantidadAleatoria: z.number().int().positive().nullable().optional(),
  turno: z.string().min(1),
});

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async iniciarConteo(datos: z.infer<typeof IniciarConteoSchema>, usuarioId: string) {
    const productos = await this.prisma.producto.findMany({ where: { activo: true } });

    let seleccion = productos;
    if (datos.tipo === "aleatorio" && datos.cantidadAleatoria) {
      const mezclados = [...productos].sort(() => Math.random() - 0.5);
      seleccion = mezclados.slice(0, Math.min(datos.cantidadAleatoria, productos.length));
    }

    const conteo = await this.prisma.conteoInventario.create({
      data: {
        tipo: datos.tipo === "general" ? TipoConteo.GENERAL : TipoConteo.ALEATORIO,
        usuarioId,
        turno: datos.turno,
        lineas: {
          create: seleccion.map((p) => ({
            productoId: p.id,
            stockTeorico: p.stockFisico,
          })),
        },
      },
      include: { lineas: true },
    });

    return this.dtoConteo(conteo);
  }

  async actualizarLinea(conteoId: string, productoId: string, stockFisico: number) {
    const linea = await this.prisma.conteoLinea.findUnique({
      where: { conteoId_productoId: { conteoId, productoId } },
      include: { conteo: true },
    });
    if (!linea) throw new ErrorDominio("NO_ENCONTRADO", "Línea de conteo no encontrada", 404);
    if (linea.conteo.estado !== EstadoConteo.EN_CURSO) {
      throw new ErrorDominio("CONTEO_NO_EN_CURSO", "El conteo no está en curso");
    }

    await this.prisma.conteoLinea.update({
      where: { id: linea.id },
      data: {
        stockFisico,
        diferencia: stockFisico - linea.stockTeorico,
        contadoEn: new Date(),
      },
    });

    return this.obtener(conteoId);
  }

  async finalizar(conteoId: string) {
    await this.validarEnCurso(conteoId);
    await this.prisma.conteoInventario.update({
      where: { id: conteoId },
      data: { estado: EstadoConteo.CONFIRMADO, finalizadoEn: new Date() },
    });
    return this.obtener(conteoId);
  }

  async cancelar(conteoId: string) {
    await this.validarEnCurso(conteoId);
    await this.prisma.conteoInventario.update({
      where: { id: conteoId },
      data: { estado: EstadoConteo.CANCELADO, finalizadoEn: new Date() },
    });
    return this.obtener(conteoId);
  }

  async aplicarAjuste(conteoId: string, usuarioId: string) {
    const conteo = await this.prisma.conteoInventario.findUnique({
      where: { id: conteoId },
      include: { lineas: true },
    });
    if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
    if (conteo.estado !== EstadoConteo.CONFIRMADO) throw new ErrorDominio("CONTEO_NO_CONFIRMADO", "El conteo debe estar confirmado");

    const yaAjustado = await this.prisma.ajusteInventario.findFirst({ where: { conteoId } });
    if (yaAjustado) throw new ErrorDominio("AJUSTE_DUPLICADO", "Este conteo ya fue aplicado", 409);

    const contadas = conteo.lineas.filter((l) => l.stockFisico !== null);

    await this.prisma.$transaction(async (tx) => {
      const ajuste = await tx.ajusteInventario.create({
        data: { conteoId, usuarioId, motivo: "Conteo de inventario" },
      });

      for (const linea of contadas) {
        const producto = await tx.producto.findUniqueOrThrow({ where: { id: linea.productoId } });
        await tx.ajusteLinea.create({
          data: {
            ajusteInventarioId: ajuste.id,
            conteoLineaId: linea.id,
            productoId: linea.productoId,
            stockTeorico: linea.stockTeorico,
            stockFisico: linea.stockFisico as number,
            diferencia: linea.diferencia ?? 0,
          },
        });
        await tx.producto.update({
          where: { id: linea.productoId },
          data: { stockFisico: linea.stockFisico as number },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: linea.productoId,
            tipo: TipoMovimientoInventario.AJUSTE_CONTEO,
            cantidad: Math.abs((linea.stockFisico as number) - producto.stockFisico),
            deltaStockFisico: (linea.stockFisico as number) - producto.stockFisico,
            stockFisicoAntes: producto.stockFisico,
            stockFisicoDespues: linea.stockFisico as number,
            stockReservadoAntes: producto.stockReservado,
            stockReservadoDespues: producto.stockReservado,
            conteoId,
            ajusteInventarioId: ajuste.id,
            usuarioId,
          },
        });
      }
    });

    return this.obtener(conteoId);
  }

  async ajusteManual(productoId: string, stockFisico: number, motivo: string, comentario: string | undefined, usuarioId: string) {
    const producto = await this.prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) throw new ErrorDominio("NO_ENCONTRADO", "Producto no encontrado", 404);

    await this.prisma.$transaction(async (tx) => {
      const ajuste = await tx.ajusteInventario.create({
        data: { conteoId: null, usuarioId, motivo, comentario },
      });
      await tx.ajusteLinea.create({
        data: {
          ajusteInventarioId: ajuste.id,
          productoId,
          stockTeorico: producto.stockFisico,
          stockFisico,
          diferencia: stockFisico - producto.stockFisico,
        },
      });
      await tx.producto.update({
        where: { id: productoId },
        data: { stockFisico },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId,
          tipo: TipoMovimientoInventario.AJUSTE_MANUAL,
          cantidad: Math.abs(stockFisico - producto.stockFisico),
          deltaStockFisico: stockFisico - producto.stockFisico,
          stockFisicoAntes: producto.stockFisico,
          stockFisicoDespues: stockFisico,
          stockReservadoAntes: producto.stockReservado,
          stockReservadoDespues: producto.stockReservado,
          ajusteInventarioId: ajuste.id,
          motivo,
          comentario,
          usuarioId,
        },
      });
    });

    return { productoId, stockFisico, motivo };
  }

  async listarConteos() {
    const conteos = await this.prisma.conteoInventario.findMany({
      orderBy: { iniciadoEn: "desc" },
      include: { lineas: true },
    });
    return { data: conteos.map((c) => this.dtoConteo(c)) };
  }

  async obtener(conteoId: string) {
    const conteo = await this.prisma.conteoInventario.findUnique({
      where: { id: conteoId },
      include: { lineas: true },
    });
    if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
    return this.dtoConteo(conteo);
  }

  private async validarEnCurso(conteoId: string) {
    const conteo = await this.prisma.conteoInventario.findUnique({ where: { id: conteoId } });
    if (!conteo) throw new ErrorDominio("NO_ENCONTRADO", "Conteo no encontrado", 404);
    if (conteo.estado !== EstadoConteo.EN_CURSO) throw new ErrorDominio("CONTEO_NO_EN_CURSO", "El conteo no está en curso");
  }

  private dtoConteo(c: {
    id: string;
    tipo: TipoConteo;
    usuarioId: string;
    turno: string;
    iniciadoEn: Date;
    finalizadoEn: Date | null;
    estado: EstadoConteo;
    lineas: Array<{
      id: string;
      productoId: string;
      stockTeorico: number;
      stockFisico: number | null;
      diferencia: number | null;
    }>;
  }) {
    const contadas = c.lineas.filter((l) => l.stockFisico !== null);
    return {
      id: c.id,
      tipo: c.tipo.toLowerCase(),
      usuarioId: c.usuarioId,
      turno: c.turno,
      iniciadoEn: c.iniciadoEn,
      finalizadoEn: c.finalizadoEn,
      estado: c.estado.toLowerCase(),
      lineas: c.lineas.map((l) => ({
        id: l.id,
        productoId: l.productoId,
        stockTeorico: l.stockTeorico,
        stockFisico: l.stockFisico,
        diferencia: l.diferencia,
      })),
      resumen: {
        contadas: contadas.length,
        sobrantes: contadas.filter((l) => (l.diferencia ?? 0) > 0).length,
        faltantes: contadas.filter((l) => (l.diferencia ?? 0) < 0).length,
        totalDiferencia: contadas.reduce((s, l) => s + (l.diferencia ?? 0), 0),
      },
    };
  }
}
