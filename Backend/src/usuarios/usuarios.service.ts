import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo } from "../common/consecutivos";
import { codigoDeRol } from "../common/roles";
import { RolUsuario } from "@prisma/client";
import { CrearUsuarioEsquema } from "@ambie/contrato";

const CrearUsuarioSchema = CrearUsuarioEsquema;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(pagina = 1, porPagina = 20, q = "") {
    const where = q ? { OR: [{ nombre: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, ...(q === "administrador" ? [{ rol: RolUsuario.ADMINISTRADOR }] : q === "vendedor" ? [{ rol: RolUsuario.VENDEDOR }] : q === "inventario" ? [{ rol: RolUsuario.INVENTARIO }] : [])] } : {};
    const total = await this.prisma.usuario.count({ where });
    const actual = Math.min(pagina, Math.max(1, Math.ceil(total / porPagina)));
    const usuarios = await this.prisma.usuario.findMany({ where, orderBy: [{ rol: "asc" }, { nombre: "asc" }, { id: "asc" }], take: porPagina, skip: (actual - 1) * porPagina });
    const data = await Promise.all(
      usuarios.map(async (u) => {
        const permisos = await this.permisosDe(u.id);
        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          email: u.email,
          rol: codigoDeRol(u.rol),
          permisos,
          activo: u.activo,
          esSistema: u.esSistema,
          creadoEn: u.creadoEn,
        };
      }),
    );
    return { data, meta: { total, pagina: actual, porPagina } };
  }

  async crear(datos: z.infer<typeof CrearUsuarioSchema>) {
    if (datos.nombre.trim().toLowerCase() === "system") throw new ErrorDominio("NOMBRE_RESERVADO", "system es un usuario reservado de la instalación", 409);
    const existente = await this.prisma.usuario.findUnique({ where: { email: datos.email } });
    if (existente) throw new ErrorDominio("EMAIL_DUPLICADO", "Ya existe un usuario con ese correo", 409);

    const passwordHash = await argon2.hash(datos.password);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigo(tx, "USR");
      return tx.usuario.create({
        data: {
          codigo,
          nombre: datos.nombre.trim(),
          email: datos.email,
          passwordHash,
          rol: RolUsuario[datos.rol.toUpperCase() as keyof typeof RolUsuario],
        },
      });
    });

    return {
      id: usuario.id,
      codigo: usuario.codigo,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: codigoDeRol(usuario.rol),
      activo: usuario.activo,
    };
  }

  async cambiarEstado(usuarioId: string, actorId: string) {
    return this.actualizarAcceso(usuarioId, actorId);
  }

  async cambiarRol(usuarioId: string, rol: "administrador" | "vendedor" | "inventario", actorId: string) {
    return this.actualizarAcceso(usuarioId, actorId, RolUsuario[rol.toUpperCase() as keyof typeof RolUsuario]);
  }

  private async actualizarAcceso(usuarioId: string, actorId: string, rol?: RolUsuario) {
    if (usuarioId === actorId) throw new ErrorDominio("ACCESO_PROPIO", "Otro administrador debe modificar tu acceso", 409);
    return this.prisma.$transaction(async (tx) => {
      // Serializar cambios administrativos evita desactivar a los dos últimos administradores a la vez.
      await tx.$queryRaw`SELECT id FROM usuarios WHERE rol = 'administrador' ORDER BY id FOR UPDATE`;
      const usuario = await tx.usuario.findUnique({ where: { id: usuarioId } });
      if (!usuario) throw new ErrorDominio("NO_ENCONTRADO", "Usuario no encontrado", 404);
      if (usuario.esSistema) throw new ErrorDominio("SYSTEM_PROTEGIDO", "No se puede desactivar ni cambiar el rol de system", 409);
      const activo = rol ? usuario.activo : !usuario.activo;
      const nuevoRol = rol ?? usuario.rol;
      if (usuario.activo && usuario.rol === RolUsuario.ADMINISTRADOR && (!activo || nuevoRol !== RolUsuario.ADMINISTRADOR)) {
        const administradores = await tx.usuario.count({ where: { activo: true, rol: RolUsuario.ADMINISTRADOR } });
        if (administradores <= 1) throw new ErrorDominio("ULTIMO_ADMINISTRADOR", "Debe quedar al menos un administrador activo", 409);
      }
      const actualizado = await tx.usuario.update({ where: { id: usuarioId }, data: { activo, rol: nuevoRol } });
      await tx.sesion.updateMany({ where: { usuarioId, revocadoEn: null }, data: { revocadoEn: new Date() } });
      await tx.auditoriaEvento.create({ data: { entidadTipo: "usuario", entidadId: usuarioId, accion: rol ? "cambiar-rol" : "cambiar-estado", usuarioId: actorId,
        datosAntes: { activo: usuario.activo, rol: codigoDeRol(usuario.rol) }, datosDespues: { activo, rol: codigoDeRol(nuevoRol) } } });
      return { id: actualizado.id, activo, rol: codigoDeRol(nuevoRol) };
    });
  }

  private async permisosDe(usuarioId: string): Promise<string[]> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return [];
    if (usuario.esSistema) return (await this.prisma.permiso.findMany()).map((p) => p.codigo);
    const vinculos = await this.prisma.rolPermiso.findMany({
      where: { rol: { codigo: codigoDeRol(usuario.rol) } },
      include: { permiso: true },
    });
    return vinculos.map((v) => v.permiso.codigo);
  }
}
