import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo, numero } from "../common/consecutivos";
import { aplicadoPorPedido } from "../dominio/cartera";
import { EstadoPedido } from "@prisma/client";

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
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        clienteId: { in: clientes.map((c) => c.id) },
        estado: { not: EstadoPedido.CANCELADO },
      },
      select: { id: true, clienteId: true, total: true },
    });

    const aplicados = await aplicadoPorPedido(
      this.prisma,
      pedidos.map((p) => p.id),
    );

    const porCliente = new Map<string, number>();
    for (const p of pedidos) {
      const saldo = Math.max(0, numero(p.total) - (aplicados.get(p.id) ?? 0));
      porCliente.set(p.clienteId, (porCliente.get(p.clienteId) ?? 0) + saldo);
    }

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
