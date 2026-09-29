import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module";
import { METODO_PAGO } from "@ambie/contrato";

/**
 * Catálogos de apoyo para los formularios del frontend.
 *
 * Se agrupan porque son lecturas simples que rara vez cambian y que el
 * cliente necesita para construir sus selectores.
 */
@Controller("catalogos")
export class CatalogosController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Todo lo que el frontend necesita para pintar sus selectores en una sola
   * llamada, en lugar de tres.
   */
  @Get()
  async catalogos() {
    const [categorias, tiposCredito, unidades] = await Promise.all([
      this.prisma.categoria.findMany({
        where: { activo: true },
        orderBy: [{ orden: "asc" }, { nombre: "asc" }],
        select: { id: true, codigo: true, nombre: true, orden: true },
      }),
      this.prisma.tipoCredito.findMany({
        where: { activo: true },
        orderBy: [{ orden: "asc" }, { nombre: "asc" }],
        select: { id: true, codigo: true, nombre: true, frecuenciaCreditoDias: true, orden: true },
      }),
      this.prisma.producto.findMany({
        where: { activo: true },
        distinct: ["unidad"],
        select: { unidad: true },
        orderBy: { unidad: "asc" },
      }),
    ]);

    return {
      data: {
        categorias,
        tiposCredito,
        // Viene del contrato, no de la base: así frontend y API comparten
        // exactamente la misma lista y no pueden desincronizarse.
        metodosPago: METODO_PAGO,
        unidades: unidades.map((u) => u.unidad),
      },
    };
  }

  @Get("categorias")
  async categorias() {
    const data = await this.prisma.categoria.findMany({
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    return { data };
  }

  @Get("tipos-credito")
  async tiposCredito() {
    const data = await this.prisma.tipoCredito.findMany({
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    return { data };
  }
}
