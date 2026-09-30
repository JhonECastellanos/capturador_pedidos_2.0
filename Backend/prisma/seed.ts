import { PrismaClient } from "@prisma/client";
import { asegurarSystem } from "./system";

const prisma = new PrismaClient();

const ROLES = [
  { codigo: "administrador", nombre: "Administrador", descripcion: "Control total del negocio" },
  { codigo: "vendedor", nombre: "Vendedor", descripcion: "Venta y cobro de pedidos" },
];

const PERMISOS = [
  { codigo: "pedidos", nombre: "Pedidos", descripcion: "Gestionar pedidos" },
  { codigo: "inventario", nombre: "Inventario", descripcion: "Gestionar inventario y conteos" },
  { codigo: "caja", nombre: "Caja", descripcion: "Consultar caja y cierres" },
  { codigo: "usuarios", nombre: "Usuarios", descripcion: "Administrar usuarios" },
  { codigo: "cierre-diario", nombre: "Cierre diario", descripcion: "Ejecutar cierre del día" },
  { codigo: "clientes", nombre: "Clientes", descripcion: "Gestionar clientes" },
  { codigo: "cobros", nombre: "Cobros", descripcion: "Registrar abonos y cobros" },
];

/**
 * Permisos por rol, indexados por el `codigo` de `roles`.
 *
 * El código va en minúscula porque es el valor del contrato (`@ambie/contrato`)
 * y el `@map(...)` del enum en Prisma; los nombres del enum del cliente
 * (`RolUsuario.ADMINISTRADOR`) son otra cosa y no coinciden con esta columna.
 */
const PERMISOS_POR_ROL: Record<string, string[]> = {
  administrador: PERMISOS.map((permiso) => permiso.codigo),
  vendedor: ["clientes", "pedidos", "cobros"],
};

const CATEGORIAS = ["Bebidas", "Lácteos", "Aseo", "Snacks", "Abarrotes"];

const TIPOS_CREDITO = [
  { codigo: "TC-0001", nombre: "diario", frecuenciaCreditoDias: 1 },
  { codigo: "TC-0002", nombre: "semanal", frecuenciaCreditoDias: 7 },
  { codigo: "TC-0003", nombre: "quincenal", frecuenciaCreditoDias: 15 },
  { codigo: "TC-0004", nombre: "mensual", frecuenciaCreditoDias: 30 },
];

async function main() {
  for (const rol of ROLES) {
    await prisma.rol.upsert({
      where: { codigo: rol.codigo },
      update: { nombre: rol.nombre, descripcion: rol.descripcion, activo: true },
      create: rol,
    });
  }

  for (const permiso of PERMISOS) {
    await prisma.permiso.upsert({
      where: { codigo: permiso.codigo },
      update: { nombre: permiso.nombre, descripcion: permiso.descripcion },
      create: permiso,
    });
  }

  for (const [rolCodigo, permisos] of Object.entries(PERMISOS_POR_ROL)) {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: rolCodigo } });
    for (const permisoCodigo of permisos) {
      const permiso = await prisma.permiso.findUniqueOrThrow({ where: { codigo: permisoCodigo } });
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rol.id, permisoId: permiso.id } },
        update: {},
        create: { rolId: rol.id, permisoId: permiso.id },
      });
    }
  }

  for (let i = 0; i < CATEGORIAS.length; i += 1) {
    const nombre = CATEGORIAS[i];
    await prisma.categoria.upsert({
      where: { nombre },
      update: { activo: true, orden: i },
      create: { codigo: `CAT-${String(i + 1).padStart(4, "0")}`, nombre, orden: i },
    });
  }

  for (let i = 0; i < TIPOS_CREDITO.length; i += 1) {
    const tipo = TIPOS_CREDITO[i];
    await prisma.tipoCredito.upsert({
      where: { codigo: tipo.codigo },
      update: { nombre: tipo.nombre, frecuenciaCreditoDias: tipo.frecuenciaCreditoDias, activo: true, orden: i },
      create: { ...tipo, orden: i },
    });
  }

  await asegurarSystem(prisma);
  console.log("✔ Seed completado: roles, permisos, categorías, tipos de crédito y system.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
