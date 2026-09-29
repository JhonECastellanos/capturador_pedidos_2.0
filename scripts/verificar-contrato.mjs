/**
 * Verifica que los enums del contrato compartido coincidan exactamente con
 * los `@map(...)` de los enums de `Backend/prisma/schema.prisma`.
 *
 * Si alguien cambia un valor en un lado y no en el otro, este script falla.
 *
 *   node scripts/verificar-contrato.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/** Enums de Prisma que deben coincidir con el contrato. */
const ENUM_PRISMA = [
  "RolUsuario",
  "MetodoPago",
  "MomentoCobro",
  "EstadoPedido",
  "EstadoCuenta",
  "TipoPago",
  "EstadoPago",
  "TipoMovimientoCaja",
  "TipoConteo",
  "EstadoConteo",
  "TipoMovimientoInventario",
  "EstadoReserva",
  "EstadoFactura",
  "EstadoCierre",
];

/** Constantes del contrato que corresponden a cada enum de Prisma. */
const CONSTANTE_CONTRATO = {
  RolUsuario: "ROL_USUARIO",
  MetodoPago: "METODO_PAGO",
  MomentoCobro: "MOMENTO_COBRO",
  EstadoPedido: "ESTADO_PEDIDO",
  EstadoCuenta: "ESTADO_CUENTA",
  TipoPago: "TIPO_PAGO",
  EstadoPago: "ESTADO_PAGO",
  TipoMovimientoCaja: "TIPO_MOVIMIENTO_CAJA",
  TipoConteo: "TIPO_CONTEO",
  EstadoConteo: "ESTADO_CONTEO",
  TipoMovimientoInventario: "TIPO_MOVIMIENTO_INVENTARIO",
  EstadoReserva: "ESTADO_RESERVA",
  EstadoFactura: "ESTADO_FACTURA",
  EstadoCierre: "ESTADO_CIERRE",
};

/** Lee los valores mapeados de un enum de Prisma. */
function leerEnumPrisma(contenido, nombre) {
  const re = new RegExp(`enum\\s+${nombre}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const coincidencia = contenido.match(re);
  if (!coincidencia) return null;

  return [...coincidencia[1].matchAll(/@map\("([^"]+)"\)/g)].map((m) => m[1]);
}

const rutaSchema = join(raiz, "Backend", "prisma", "schema.prisma");
if (!existsSync(rutaSchema)) {
  console.error("No se encontró Backend/prisma/schema.prisma");
  process.exit(1);
}

const esquema = readFileSync(rutaSchema, "utf8");
const contrato = require(join(raiz, "Compartido", "dist", "index.js"));

let errores = 0;
const filas = [];

for (const nombreEnum of ENUM_PRISMA) {
  const prisma = leerEnumPrisma(esquema, nombreEnum);
  const nombreConstante = CONSTANTE_CONTRATO[nombreEnum];
  const contratoValores = contrato[nombreConstante];

  if (prisma === null) {
    console.error(`✗ enum ${nombreEnum} no encontrado en schema.prisma`);
    errores += 1;
    continue;
  }
  if (!Array.isArray(contratoValores)) {
    console.error(`✗ constante ${nombreConstante} no encontrada en el contrato`);
    errores += 1;
    continue;
  }

  const soloPrisma = prisma.filter((v) => !contratoValores.includes(v));
  const soloContrato = contratoValores.filter((v) => !prisma.includes(v));

  if (soloPrisma.length === 0 && soloContrato.length === 0) {
    console.log(`✓ ${nombreEnum} (${contratoValores.length} valores)`);
    filas.push({ enum: nombreEnum, estado: "iguales", valores: contratoValores.join(", ") });
  } else {
    errores += 1;
    console.error(`✗ ${nombreEnum} no coincide`);
    if (soloPrisma.length) console.error(`    solo en Prisma: ${soloPrisma.join(", ")}`);
    if (soloContrato.length) console.error(`    solo en contrato: ${soloContrato.join(", ")}`);
    filas.push({ enum: nombreEnum, estado: "DIFIEREN", valores: contratoValores.join(", ") });
  }
}

console.log("");
if (errores > 0) {
  console.error(`✗ ${errores} enum(s) desincronizados entre contrato y base de datos.`);
  process.exit(1);
}

console.log(`✓ Los ${ENUM_PRISMA.length} enums del contrato coinciden con la base de datos.`);
