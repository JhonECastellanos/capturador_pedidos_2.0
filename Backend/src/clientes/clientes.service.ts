import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero } from "../common/consecutivos";
import { pedidosConSaldoSql, aplicadoPorPedido } from "../dominio/cartera";
import { EstadoPedido, Prisma } from "@prisma/client";

export const NuevoClienteSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().min(5),
  direccion: z.string().min(3),
  fechaNacimiento: z.string().optional(),
  tipoCredito: z.enum(["diario", "semanal", "quincenal", "mensual"]).optional(),
  alias: z.string().optional(),
  identificacion: z.string().optional(),
  ciudad: z.string().optional(),
});

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(q?: string, pagina = 1, porPagina = 20) {
    const where = q
      ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" as const } },
            { alias: { contains: q, mode: "insensitive" as const } },
            { telefono: { contains: q, mode: "insensitive" as const } },
            { codigo: { contains: q, mode: "insensitive" as const } },
            { direccion: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, clientes] = await this.prisma.$transaction([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { tipoCredito: true },
      }),
    ]);

    const conSaldos = await this.enriquecerSaldos(clientes);
    return {
      data: conSaldos,
      meta: { pagina, porPagina, total },
    };
  }

  async listarCartera(pagina = 1, porPagina = 15, q = "", clienteId?: string, orden = "total") {
    return this.prisma.$transaction(async tx => {
      const filtro = q ? Prisma.sql`AND (c.nombre ILIKE ${'%'+q+'%'} OR c.alias ILIKE ${'%'+q+'%'} OR c.telefono ILIKE ${'%'+q+'%'} OR EXISTS (SELECT 1 FROM saldos s WHERE s."clienteId"=c.id AND s.saldo>0 AND s.numero ILIKE ${'%'+q+'%'}))` : Prisma.empty;
      const base = Prisma.sql`${pedidosConSaldoSql}, grupos AS (SELECT "clienteId", SUM(saldo) AS total, COUNT(*) AS cantidad, MIN("creadoEn") AS antiguo FROM saldos WHERE saldo>0 AND "clienteId" IS NOT NULL GROUP BY "clienteId")`;
      const condicion = Prisma.sql`FROM grupos g JOIN clientes c ON c.id=g."clienteId" WHERE TRUE ${filtro} ${clienteId ? Prisma.sql`AND c.id=${clienteId}` : Prisma.empty}`;
      const [cuenta] = await tx.$queryRaw<Array<{cantidad:bigint}>>(Prisma.sql`${base} SELECT COUNT(*) AS cantidad ${condicion}`);
      const [resumen] = await tx.$queryRaw<Array<{total:Prisma.Decimal}>>(Prisma.sql`${base} SELECT COALESCE(SUM(total),0) AS total FROM grupos`);
      const total=Number(cuenta.cantidad), actual=Math.min(pagina,Math.max(1,Math.ceil(total/porPagina)));
      const filas=await tx.$queryRaw<Array<{clienteId:string;total:Prisma.Decimal;cantidad:bigint;antiguo:Date}>>(Prisma.sql`${base} SELECT g.* ${condicion} ORDER BY ${orden === "mora" ? Prisma.sql`g.antiguo,g.total DESC,c.id` : Prisma.sql`g.total DESC,g.antiguo,c.id`} LIMIT ${porPagina} OFFSET ${(actual-1)*porPagina}`);
      const clientes=await tx.cliente.findMany({where:{id:{in:filas.map(f=>f.clienteId)}},include:{tipoCredito:true}});
      return {data:filas.map(f=>({clienteId:f.clienteId,cliente:{...clientes.find(c=>c.id===f.clienteId)!,tipoCredito:clientes.find(c=>c.id===f.clienteId)?.tipoCredito?.nombre, saldoPendiente:numero(f.total),estadoCuenta:"pendiente"},total:numero(f.total),cantidadPedidos:Number(f.cantidad),masAntiguo:f.antiguo,diasMora:Math.max(0,Math.floor((new Date(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota"}).format(new Date())).getTime()-new Date(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota"}).format(f.antiguo)).getTime())/86400000)),pedidos:[]})),meta:{pagina:actual,porPagina,total,saldoTotal:numero(resumen.total)}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async obtener(clienteId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      include: { tipoCredito: true },
    });
    if (!cliente) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado", 404);
    const [conSaldo] = await this.enriquecerSaldos([cliente]);
    return conSaldo;
  }

  async crear(datos: z.infer<typeof NuevoClienteSchema>, usuarioId: string) {
    const tipoCredito = datos.tipoCredito
      ? await this.prisma.tipoCredito.findUnique({ where: { nombre: datos.tipoCredito } })
      : null;

    const cliente = await this.prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigo(tx, "CLI");
      return tx.cliente.create({
        data: {
          codigo,
          nombre: datos.nombre.trim(),
          alias: datos.alias?.trim() || datos.nombre.trim(),
          identificacion: datos.identificacion?.trim() || null,
          telefono: datos.telefono.trim(),
          ciudad: datos.ciudad?.trim() || "",
          direccion: datos.direccion.trim(),
          fechaNacimiento: datos.fechaNacimiento ? new Date(`${datos.fechaNacimiento}T00:00:00.000Z`) : null,
          tipoCreditoId: tipoCredito?.id ?? null,
        },
      });
    });

    return this.obtener(cliente.id);
  }

  async cartera(clienteId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      include: { tipoCredito: true },
    });
    if (!cliente) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado", 404);

    const pedidos = await this.prisma.pedido.findMany({
      where: { clienteId, estado: { not: EstadoPedido.CANCELADO } },
      orderBy: { creadoEn: "asc" },
    });

    const aplicados = await aplicadoPorPedido(
      this.prisma,
      pedidos.map((p) => p.id),
    );

    const pedidosConSaldo = pedidos.map((p) => {
      const total = numero(p.total);
      const aplicado = aplicados.get(p.id) ?? 0;
      return {
        pedidoId: p.id,
        numero: p.numero,
        total,
        saldoPendiente: Math.max(0, total - aplicado),
        montoRecibido: aplicado,
        estado: p.estado,
        creadoEn: p.creadoEn,
      };
    });

    const saldoPendiente = pedidosConSaldo.reduce((s, p) => s + p.saldoPendiente, 0);

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      alias: cliente.alias,
      tipoCredito: cliente.tipoCredito?.nombre ?? null,
      frecuenciaCreditoDias: cliente.tipoCredito?.frecuenciaCreditoDias ?? null,
      estadoCuenta: saldoPendiente > 0 ? "pendiente" : "al-dia",
      saldoPendiente,
      pedidos: pedidosConSaldo,
    };
  }

  private async enriquecerSaldos(clientes: Array<{ id: string; tipoCredito: { nombre: string; frecuenciaCreditoDias: number } | null }>) {
    if (!clientes.length) return [];
    const saldos = await this.prisma.$queryRaw<Array<{ clienteId: string; saldo: number }>>(Prisma.sql`
      SELECT p."clienteId", SUM(GREATEST(0, p.total - COALESCE(a.aplicado, 0)))::float8 AS saldo
      FROM pedidos p
      LEFT JOIN LATERAL (
        SELECT SUM(pa."montoAplicado") AS aplicado FROM "pagoAplicaciones" pa
        JOIN pagos pago ON pago.id = pa."pagoId"
        WHERE pa."pedidoId" = p.id AND pa."revertidoEn" IS NULL AND pago.estado = 'activo'
      ) a ON true
      WHERE p."clienteId" IN (${Prisma.join(clientes.map((c) => c.id))}) AND p.estado <> 'cancelado'
      GROUP BY p."clienteId"
    `);
    const porCliente = new Map(saldos.map((fila) => [fila.clienteId, Number(fila.saldo)]));

    return clientes.map((c) => {
      const saldoPendiente = porCliente.get(c.id) ?? 0;
      return {
        ...c,
        tipoCredito: c.tipoCredito?.nombre ?? null,
        frecuenciaCreditoDias: c.tipoCredito?.frecuenciaCreditoDias ?? null,
        estadoCuenta: saldoPendiente > 0 ? "pendiente" : "al-dia",
        saldoPendiente,
      };
    });
  }
}
