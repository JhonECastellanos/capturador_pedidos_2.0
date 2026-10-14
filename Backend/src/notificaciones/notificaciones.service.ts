import { Injectable } from "@nestjs/common";
import { Usuario, Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { paginacion } from "../common/paginacion";
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}
  private filtro(usuario: Usuario): Prisma.NotificacionWhereInput {
    const tipos = usuario.esSistema ? ["pedido", "compra"] : [!usuario.permisosDenegados.includes("pedidos") && "pedido", !usuario.permisosDenegados.includes("inventario") && "compra"].filter((t): t is string => !!t);
    return { tipo: { in: tipos } };
  }
  async listar(usuario: Usuario, page?: string, pageSize?: string, recientes = false) {
    const p = paginacion(page, pageSize), where = this.filtro(usuario);
    const consulta = this.prisma.notificacion.findMany({ where, orderBy: [{ creadoEn: "desc" }, { id: "desc" }], skip: recientes ? 0 : (p.pagina - 1) * p.porPagina, take: recientes ? 30 : p.porPagina, include: { lecturas: { where: { usuarioId: usuario.id }, select: { leidoEn: true } } } });
    if (recientes) return { data: (await consulta).map(({ lecturas, ...fila }) => ({ ...fila, leida: !!lecturas.length })) };
    const [total, pendientes, filas] = await this.prisma.$transaction([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.count({ where: { ...where, lecturas: { none: { usuarioId: usuario.id } } } }),
      consulta,
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { data: filas.map(({ lecturas, ...fila }) => ({ ...fila, leida: !!lecturas.length })), meta: { total, pendientes, pagina: p.pagina, porPagina: p.porPagina } };
  }
  async leer(id: string, usuario: Usuario) {
    if (!await this.prisma.notificacion.findFirst({ where: { ...this.filtro(usuario), id: z.string().uuid().parse(id) } })) throw new ErrorDominio("NOTIFICACION_NO_EXISTE", "Este aviso no está disponible", 404);
    await this.prisma.lecturaNotificacion.upsert({ where: { notificacionId_usuarioId: { notificacionId: id, usuarioId: usuario.id } }, create: { notificacionId: id, usuarioId: usuario.id }, update: {} });
    return { data: { leida: true } };
  }
}
