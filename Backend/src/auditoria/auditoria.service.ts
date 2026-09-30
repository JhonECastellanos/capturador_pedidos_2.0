import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module";

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}
  async listar(filtro: { page: number; pageSize: number; entidad?: string }) {
    const where = filtro.entidad ? { entidadTipo: filtro.entidad } : {};
    const [total, eventos] = await this.prisma.$transaction([
      this.prisma.auditoriaEvento.count({ where }),
      this.prisma.auditoriaEvento.findMany({ where, orderBy: { creadoEn: "desc" }, skip: (filtro.page - 1) * filtro.pageSize, take: filtro.pageSize }),
    ]);
    const usuarios = await this.prisma.usuario.findMany({ where: { id: { in: eventos.flatMap((e) => e.usuarioId ? [e.usuarioId] : []) } }, select: { id: true, nombre: true } });
    return { data: eventos.map((e) => ({ ...e, usuario: usuarios.find((u) => u.id === e.usuarioId)?.nombre ?? "Sistema" })), meta: { total, pagina: filtro.page, porPagina: filtro.pageSize } };
  }
}
