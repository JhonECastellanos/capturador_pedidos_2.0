import { PrismaClient, RolUsuario } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

function siguienteCodigo(ultimo: number): string {
  return `USR-${String(ultimo).padStart(4, "0")}`;
}

async function main() {
  const email = process.env.BOOTSTRAP_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.error("Falta BOOTSTRAP_EMAIL o BOOTSTRAP_PASSWORD. Úsalos para crear el primer administrador.");
    process.exit(1);
  }

  const existente = await prisma.usuario.findFirst({ where: { rol: RolUsuario.ADMINISTRADOR } });
  if (existente) {
    console.error("Ya existe un administrador. El bootstrap solo se ejecuta una vez.");
    process.exit(1);
  }

  const consecutivo = await prisma.consecutivo.upsert({
    where: { tipo_periodo: { tipo: "USR", periodo: "global" } },
    update: {},
    create: { tipo: "USR", periodo: "global", prefijo: "USR", ancho: 4, ultimoValor: 0 },
  });
  const ultimo = consecutivo.ultimoValor + 1;

  const passwordHash = await argon2.hash(password);

  const [usuario] = await prisma.$transaction([
    prisma.usuario.create({
      data: {
        codigo: siguienteCodigo(ultimo),
        nombre: "Perfil administrador",
        email,
        passwordHash,
        rol: RolUsuario.ADMINISTRADOR,
        activo: true,
      },
    }),
    prisma.consecutivo.update({
      where: { tipo_periodo: { tipo: "USR", periodo: "global" } },
      data: { ultimoValor: ultimo },
    }),
  ]);

  console.log(`✔ Administrador creado: ${usuario.codigo} (${usuario.email})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
