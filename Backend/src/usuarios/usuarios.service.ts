import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { z } from "zod";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { siguienteCodigo } from "../common/consecutivos";
import { RolUsuario } from "@prisma/client";

const CrearUsuarioSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  rol: z.enum(["administrador", "vendedor"]),
  password: z.string().min(6),
});

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    const usuarios = await this.prisma.usuario.findMany({ orderBy: { creadoEn: "desc" } });
    const data = await Promise.all(
      usuarios.map(async (u) => {
        const permisos = await this.permisosDe(u.id);
        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          email: u.email,
          rol: u.rol,
          permisos,
          activo: u.activo,
          creadoEn: u.creadoEn,
        };
      }),
    );
    return { data };
  }

  async crear(datos: z.infer<typeof CrearUsuarioSchema>) {
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
          rol: datos.rol === "administrador" ? RolUsuario.ADMINISTRADOR : RolUsuario.VENDEDOR,
        },
      });
    });

    return {
      id: usuario.id,
      codigo: usuario.codigo,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
    };
  }

  async cambiarEstado(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new ErrorDominio("NO_ENCONTRADO", "Usuario no encontrado", 404);
    const actualizado = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { activo: !usuario.activo },
    });
    return { id: actualizado.id, activo: actualizado.activo };
  }

  private async permisosDe(usuarioId: string): Promise<string[]> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return [];
    const vinculos = await this.prisma.rolPermiso.findMany({
      where: { rol: { codigo: usuario.rol } },
      include: { permiso: true },
    });
    return vinculos.map((v) => v.permiso.codigo);
  }
}
