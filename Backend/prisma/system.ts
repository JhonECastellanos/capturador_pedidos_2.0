import { PrismaClient, RolUsuario } from "@prisma/client";
import * as argon2 from "argon2";
import { siguienteCodigo } from "../src/common/consecutivos";

/** Instalación idempotente: nunca reemplaza claves ni cuentas existentes. */
export async function asegurarSystem(prisma: PrismaClient) {
  if (await prisma.usuario.findFirst({ where: { esSistema: true } })) return;
  const password = process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD;
  const email = process.env.SYSTEM_EMAIL || "system@ambie.local";
  if (!password || password.length < 8) throw new Error("Configura SYSTEM_PASSWORD (mínimo 8 caracteres), o BOOTSTRAP_PASSWORD para la primera instalación.");
  const passwordHash = await argon2.hash(password);
  await prisma.$transaction(async (tx) => {
    // El resultado de la función es void: Prisma solo debe recibir un entero.
    await tx.$queryRaw`SELECT 1 AS bloqueo FROM pg_advisory_xact_lock(hashtext('ambie:instalacion:system'))`;
    if (await tx.usuario.findFirst({ where: { esSistema: true } })) return;
    if (await tx.usuario.findUnique({ where: { email } })) throw new Error("SYSTEM_EMAIL pertenece a otra cuenta. Usa un correo exclusivo; no se sobrescribirá al usuario.");
    await tx.usuario.create({ data: { codigo: await siguienteCodigo(tx, "USR"), nombre: "system", email, passwordHash, rol: RolUsuario.ADMINISTRADOR, activo: true, esSistema: true } });
  });
}
