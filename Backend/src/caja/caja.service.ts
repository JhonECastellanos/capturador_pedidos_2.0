import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { numero } from "../common/consecutivos";
import { hoyLocal } from "../common/crypto";
import { Prisma, MetodoPago, TipoMovimientoCaja } from "@prisma/client";

const EgresoSchema = z.object({
  concepto: z.string().min(1),
  monto: z.number().positive(),
  metodo: z.enum(["efectivo", "billetera"]).optional(),
});

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: { tipo?: string; metodo?: string; pagina?: number; porPagina?: number }) {
    const where: Prisma.MovimientoCajaWhereInput = {};
    if (filtros.tipo === "ingreso" || filtros.tipo === "egreso") {
      where.tipo = filtros.tipo === "ingreso" ? TipoMovimientoCaja.INGRESO : TipoMovimientoCaja.EGRESO;
    }
    if (filtros.metodo === "efectivo" || filtros.metodo === "billetera") {
      where.metodo = filtros.metodo === "efectivo" ? MetodoPago.EFECTIVO : MetodoPago.BILLETERA;
    }

    const pagina = filtros.pagina ?? 1;
    const porPagina = filtros.porPagina ?? 20;

    const [total, movimientos] = await this.prisma.$transaction([
      this.prisma.movimientoCaja.count({ where }),
      this.prisma.movimientoCaja.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { usuario: true },
      }),
    ]);

    const ingresos = await this.prisma.movimientoCaja.aggregate({
      where: { tipo: TipoMovimientoCaja.INGRESO },
      _sum: { monto: true },
    });
    const egresos = await this.prisma.movimientoCaja.aggregate({
      where: { tipo: TipoMovimientoCaja.EGRESO },
      _sum: { monto: true },
    });

    return {
      data: movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo.toLowerCase(),
        concepto: m.concepto,
        monto: numero(m.monto),
        metodo: m.metodo?.toLowerCase() ?? null,
        usuarioId: m.usuarioId,
        usuario: m.usuario.nombre,
        referenciaId: m.pagoId ?? m.recepcionCompraId ?? m.gastoId ?? null,
        creadoEn: m.creadoEn,
        fechaContable: m.fechaContable,
      })),
      meta: {
        pagina,
        porPagina,
        total,
        ingresos: numero(ingresos._sum.monto),
        egresos: numero(egresos._sum.monto),
        balance: numero(ingresos._sum.monto) - numero(egresos._sum.monto),
      },
    };
  }

  async egresoManual(datos: z.infer<typeof EgresoSchema>, usuarioId: string) {
    const movimiento = await this.prisma.movimientoCaja.create({
      data: {
        tipo: TipoMovimientoCaja.EGRESO,
        concepto: datos.concepto.trim(),
        monto: datos.monto,
        metodo: datos.metodo === "billetera" ? "BILLETERA" : "EFECTIVO",
        usuarioId,
        fechaContable: hoyLocal(),
        esManual: true,
      },
    });
    return { id: movimiento.id, concepto: movimiento.concepto, monto: numero(movimiento.monto), creadoEn: movimiento.creadoEn };
  }
}
