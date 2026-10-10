import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { numero, Tx } from "../common/consecutivos";
import { pedidosConSaldoSql } from "../dominio/cartera";
import { rangoPeriodo } from "../common/periodo";
import { hoyLocal } from "../common/crypto";
import { EstadoPedido, TipoMovimientoCaja, Prisma } from "@prisma/client";
import { PedidosService } from "../pedidos/pedidos.service";

const CierreSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trasladar: z.array(z.string()).optional(),
  cancelar: z.array(z.string()).optional(),
  conteoEfectivo: z.number().min(0).optional(),
  conteoBilletera: z.number().min(0).optional(),
});

@Injectable()
export class CierresService {
  constructor(private readonly prisma: PrismaService, private readonly pedidos: PedidosService) {}

  private fechaDe(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }

  async previsualizar(fechaISO: string, tx: Tx = this.prisma) {
    const fecha = this.fechaDe(fechaISO);
    const inicio = fecha;
    const fin = new Date(fecha.getTime() + 24 * 60 * 60 * 1000);

    const [ventas]=await tx.$queryRaw<Array<{totalVentas:number;pedidosCount:bigint;ventasEfectivo:number;ventasBilletera:number;ventasCredito:number;pedidosEfectivo:bigint;pedidosBilletera:bigint;pedidosCredito:bigint}>>(Prisma.sql`${pedidosConSaldoSql} SELECT COALESCE(SUM(total),0)::float8 AS "totalVentas",COUNT(*) AS "pedidosCount",COALESCE(SUM(total) FILTER (WHERE metodo='efectivo' AND saldo=0),0)::float8 AS "ventasEfectivo",COALESCE(SUM(total) FILTER (WHERE metodo='billetera' AND saldo=0),0)::float8 AS "ventasBilletera",COALESCE(SUM(saldo),0)::float8 AS "ventasCredito", COUNT(*) FILTER(WHERE metodo='efectivo' AND saldo=0) AS "pedidosEfectivo",COUNT(*) FILTER(WHERE metodo='billetera' AND saldo=0) AS "pedidosBilletera",COUNT(*) FILTER(WHERE saldo>0) AS "pedidosCredito" FROM saldos WHERE "fechaOperacion">=${inicio} AND "fechaOperacion"<${fin}`);
    const [caja]=await tx.$queryRaw<Array<{totalIngresos:number;totalEgresos:number;efectivoEsperado:number;billeteraEsperado:number}>>`SELECT COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::float8 AS "totalIngresos",COALESCE(SUM(monto) FILTER (WHERE tipo='egreso'),0)::float8 AS "totalEgresos",COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) FILTER (WHERE metodo='efectivo'),0)::float8 AS "efectivoEsperado",COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) FILTER (WHERE metodo='billetera'),0)::float8 AS "billeteraEsperado" FROM "movimientosCaja" WHERE "fechaContable">=${inicio} AND "fechaContable"<${fin}`;
    const pendientes=await tx.$queryRaw<Array<{id:string;numero:string;cliente:string;total:number;saldoPendiente:number;estado:string}>>(Prisma.sql`${pedidosConSaldoSql} SELECT s.id,s.numero,COALESCE(c.nombre,'Venta ocasional') AS cliente,s.total::float8,s.saldo::float8 AS "saldoPendiente",s.estado FROM saldos s LEFT JOIN clientes c ON c.id=s."clienteId" WHERE s."fechaOperacion">=${inicio} AND s."fechaOperacion"<${fin} AND s.saldo>0 ORDER BY s."creadoEn",s.id LIMIT 20`);
    const ayer=new Date(inicio.getTime()-86400000);
    const pendientesCount=await tx.pedido.count({where:{fechaOperacion:{gte:ayer,lt:fin},estado:{in:[EstadoPedido.PENDIENTE,EstadoPedido.EN_PREPARACION]}}});
    const pendientesAyerCount=await tx.pedido.count({where:{fechaOperacion:ayer,estado:{in:[EstadoPedido.PENDIENTE,EstadoPedido.EN_PREPARACION]}}});
    return {fecha:fechaISO,...ventas,pedidosCount:Number(ventas.pedidosCount),pedidosEfectivo:Number(ventas.pedidosEfectivo),pedidosBilletera:Number(ventas.pedidosBilletera),pedidosCredito:Number(ventas.pedidosCredito),...caja,pendientes,pendientesCount,pendientesAyerCount,yaCerrado:!!await tx.cierreDia.findUnique({where:{fecha}})};
  }

  async crear(datos: z.infer<typeof CierreSchema>, usuarioId: string) {
    const fecha = this.fechaDe(datos.fecha);
    const cierre = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre:${datos.fecha}`}))`;
      if (await tx.cierreDia.findUnique({ where: { fecha } })) throw new ErrorDominio("CIERRE_YA_EXISTE", "Este día ya fue cerrado", 409);
      const trasladados = datos.trasladar ?? [];
      const cancelados = datos.cancelar ?? [];
      const acciones = [...trasladados, ...cancelados];
      if (new Set(acciones).size !== acciones.length) throw new ErrorDominio("VALIDACION", "Un pedido no puede tener dos acciones en el cierre");
      if (acciones.length) {
        const referencias = await tx.pedido.findMany({ where: { id: { in: acciones } }, include: { lineas: true } });
        if (referencias.length !== acciones.length) throw new ErrorDominio("NO_ENCONTRADO", "Hay pedidos inexistentes", 404);
        for (const clienteId of [...new Set(referencias.map((p) => p.clienteId))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clienteId}))`;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM pedidos WHERE id IN (${Prisma.join(acciones)}) ORDER BY id FOR UPDATE`);
        const actuales = await tx.pedido.findMany({ where: { id: { in: acciones } } });
        if (actuales.some((p) => p.fechaOperacion.getTime() !== fecha.getTime() || ![EstadoPedido.PENDIENTE, EstadoPedido.EN_PREPARACION].includes(p.estado as typeof EstadoPedido.PENDIENTE))) throw new ErrorDominio("CIERRE_ACCION_INVALIDA", "Solo se gestionan pedidos por entregar del día seleccionado");
        const productos = [...new Set(referencias.flatMap((p) => p.lineas.map((l) => l.productoId)))].sort();
        if (productos.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join(productos)}) ORDER BY id FOR UPDATE`);
      }
      let resumen = await this.previsualizar(datos.fecha, tx);

      const hoy = hoyLocal();
      const nuevoDia = fecha.getTime() < hoy.getTime() ? hoy : new Date(hoy.getTime() + 86400000);

      const creado = await tx.cierreDia.create({
        data: {
          fecha,
          usuarioId,
          totalVentas: resumen.totalVentas,
          totalIngresos: resumen.totalIngresos,
          totalEgresos: resumen.totalEgresos,
          pedidosCount: resumen.pedidosCount,
          pendientesTrasladados: trasladados.length,
          pendientesCancelados: cancelados.length,
          cerradoEn: new Date(),
        },
      });

      for (const pedidoId of trasladados) {
        const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
        if (!pedido) continue;
        await tx.pedido.update({ where: { id: pedidoId }, data: { fechaOperacion: nuevoDia } });
        await tx.cierreAccion.create({
          data: {
            cierreId: creado.id,
            pedidoId,
            accion: "trasladar",
            fechaOperacionAnterior: fecha,
            fechaOperacionNueva: nuevoDia,
            usuarioId,
          },
        });
      }

      for (const pedidoId of cancelados) {
        await this.pedidos.cambiarEstadoEnTx(tx, pedidoId, EstadoPedido.CANCELADO, usuarioId, "Cancelado en cierre");
        await tx.cierreAccion.create({
          data: {
            cierreId: creado.id,
            pedidoId,
            accion: "cancelar",
            fechaOperacionAnterior: fecha,
            usuarioId,
          },
        });
      }

      resumen = await this.previsualizar(datos.fecha, tx);
      await tx.cierreMedio.create({
        data: {
          cierreId: creado.id,
          medio: "efectivo",
          esperado: resumen.efectivoEsperado,
          contado: datos.conteoEfectivo ?? 0,
          diferencia: (datos.conteoEfectivo ?? 0) - resumen.efectivoEsperado,
        },
      });
      await tx.cierreMedio.create({
        data: {
          cierreId: creado.id,
          medio: "billetera",
          esperado: resumen.billeteraEsperado,
          contado: datos.conteoBilletera ?? 0,
          diferencia: (datos.conteoBilletera ?? 0) - resumen.billeteraEsperado,
        },
      });

      return tx.cierreDia.update({ where: { id: creado.id }, data: { totalVentas: resumen.totalVentas, totalIngresos: resumen.totalIngresos, totalEgresos: resumen.totalEgresos, pedidosCount: resumen.pedidosCount } });
    });

    return {
      id: cierre.id,
      fecha: datos.fecha,
      usuarioId: cierre.usuarioId,
      totalVentas: numero(cierre.totalVentas),
      totalIngresos: numero(cierre.totalIngresos),
      totalEgresos: numero(cierre.totalEgresos),
      pedidosCount: cierre.pedidosCount,
      pendientesTrasladados: cierre.pendientesTrasladados,
      pendientesCancelados: cierre.pendientesCancelados,
      creadoEn: cierre.creadoEn,
    };
  }

  async historial(pagina = 1, porPagina = 20, periodo = "todo", desde?:string, hasta?:string) {
    const where:Prisma.CierreDiaWhereInput={fecha:rangoPeriodo(periodo,true)};
    if(desde || hasta) where.AND=[...(desde?[{fecha:{gte:new Date(`${desde}T00:00:00Z`)}}]:[]),...(hasta?[{fecha:{lte:new Date(`${hasta}T00:00:00Z`)}}]:[])];
    const [total, cierres] = await this.prisma.$transaction([
      this.prisma.cierreDia.count({where}),
      this.prisma.cierreDia.findMany({
        orderBy: { fecha: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { medios: true, usuario: true },
      }),
    ]);

    return {
      data: cierres.map((c) => ({
        id: c.id,
        fecha: c.fecha,
        usuarioId: c.usuarioId,
        usuario: c.usuario.nombre,
        totalVentas: numero(c.totalVentas),
        totalIngresos: numero(c.totalIngresos),
        totalEgresos: numero(c.totalEgresos),
        pedidosCount: c.pedidosCount,
        pendientesTrasladados: c.pendientesTrasladados,
        pendientesCancelados: c.pendientesCancelados,
        estado: c.estado.toLowerCase(),
        medios: c.medios.map((m) => ({
          medio: m.medio,
          esperado: numero(m.esperado),
          contado: numero(m.contado),
          diferencia: numero(m.diferencia),
        })),
        creadoEn: c.creadoEn,
        conteoEfectivo: c.medios.find((m) => m.medio === "efectivo") ? numero(c.medios.find((m) => m.medio === "efectivo")!.contado) : undefined,
        conteoBilletera: c.medios.find((m) => m.medio === "billetera") ? numero(c.medios.find((m) => m.medio === "billetera")!.contado) : undefined,
        diferenciaEfectivo: c.medios.find((m) => m.medio === "efectivo") ? numero(c.medios.find((m) => m.medio === "efectivo")!.diferencia) : undefined,
        diferenciaBilletera: c.medios.find((m) => m.medio === "billetera") ? numero(c.medios.find((m) => m.medio === "billetera")!.diferencia) : undefined,
      })),
      meta: { pagina, porPagina, total },
    };
  }

}
