import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { numero } from "../common/consecutivos";
import { rangoPeriodo } from "../common/periodo";
import { pedidosConSaldoSql } from "../dominio/cartera";
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

  async listar(filtros: { tipo?:string; metodo?:string; pagina?:number; porPagina?:number; q?:string; periodo?:string }) {
    const q=filtros.q?.trim() ?? "", rango=rangoPeriodo(filtros.periodo);
    const base:Prisma.MovimientoCajaWhereInput={creadoEn:rango,...(q?{OR:[{concepto:{contains:q,mode:"insensitive"}},{pago:{cliente:{nombre:{contains:q,mode:"insensitive"}}}},{pago:{cliente:{alias:{contains:q,mode:"insensitive"}}}},{pago:{aplicaciones:{some:{pedido:{numero:{contains:q,mode:"insensitive"}}}}}},...(q.toLowerCase()==="efectivo"?[{metodo:MetodoPago.EFECTIVO}]:q.toLowerCase()==="billetera"?[{metodo:MetodoPago.BILLETERA}]:[]),...(q.toLowerCase()==="ingreso"?[{tipo:TipoMovimientoCaja.INGRESO}]:q.toLowerCase()==="egreso"?[{tipo:TipoMovimientoCaja.EGRESO}]:[])]}: {})};
    const where:Prisma.MovimientoCajaWhereInput={...base,...(filtros.tipo==="ingreso"?{tipo:TipoMovimientoCaja.INGRESO}:filtros.tipo==="egreso"?{tipo:TipoMovimientoCaja.EGRESO}:{}),...(filtros.metodo==="efectivo"?{metodo:MetodoPago.EFECTIVO}:filtros.metodo==="billetera"?{metodo:MetodoPago.BILLETERA}:{})};
    return this.prisma.$transaction(async tx=>{
      const total=await tx.movimientoCaja.count({where}),porPagina=filtros.porPagina??20,pagina=Math.min(filtros.pagina??1,Math.max(1,Math.ceil(total/porPagina)));
      const movimientos=await tx.movimientoCaja.findMany({where,orderBy:[{creadoEn:"desc"},{id:"desc"}],skip:(pagina-1)*porPagina,take:porPagina,include:{usuario:true}});
      const grupos=await tx.movimientoCaja.groupBy({by:["tipo","metodo"],where:base,_sum:{monto:true}});
      const suma=(tipo:TipoMovimientoCaja,metodo?:MetodoPago)=>grupos.filter(g=>g.tipo===tipo&&(!metodo||g.metodo===metodo)).reduce((t,g)=>t+numero(g._sum.monto),0);
      const creditoFiltro=Prisma.sql`WHERE s.saldo>0 ${rango?Prisma.sql`AND s."creadoEn">=${rango.gte} ${rango.lt?Prisma.sql`AND s."creadoEn"<${rango.lt}`:Prisma.empty}`:Prisma.empty} ${q?Prisma.sql`AND (s.numero ILIKE ${'%'+q+'%'} OR c.nombre ILIKE ${'%'+q+'%'} OR c.alias ILIKE ${'%'+q+'%'})`:Prisma.empty}`;
      const [credito]=await tx.$queryRaw<Array<{total:Prisma.Decimal}>>(Prisma.sql`${pedidosConSaldoSql} SELECT COALESCE(SUM(s.saldo),0) AS total FROM saldos s LEFT JOIN clientes c ON c.id=s."clienteId" ${creditoFiltro}`);
      const ingresos=suma(TipoMovimientoCaja.INGRESO),egresos=suma(TipoMovimientoCaja.EGRESO);
      return {data:movimientos.map(m=>({id:m.id,tipo:m.tipo.toLowerCase(),concepto:m.concepto,monto:numero(m.monto),metodo:m.metodo?.toLowerCase()??null,usuarioId:m.usuarioId,usuario:m.usuario.nombre,referenciaId:m.pagoId??m.recepcionCompraId??m.gastoId??null,creadoEn:m.creadoEn,fechaContable:m.fechaContable})),meta:{pagina,porPagina,total,ingresos,egresos,balance:ingresos-egresos,efectivo:suma(TipoMovimientoCaja.INGRESO,MetodoPago.EFECTIVO),billetera:suma(TipoMovimientoCaja.INGRESO,MetodoPago.BILLETERA),creditoPendiente:numero(credito.total)}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async resumenPeriodos() {
    return Promise.all(["hoy","ayer","semana","mes","anio","todo"].map(async periodo=>{
      const grupos=await this.prisma.movimientoCaja.groupBy({by:["tipo"],where:{creadoEn:rangoPeriodo(periodo)},_sum:{monto:true}});
      const ingresos=numero(grupos.find(g=>g.tipo===TipoMovimientoCaja.INGRESO)?._sum.monto),egresos=numero(grupos.find(g=>g.tipo===TipoMovimientoCaja.EGRESO)?._sum.monto);
      return {periodo,ingresos,egresos,neto:ingresos-egresos};
    }));
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
