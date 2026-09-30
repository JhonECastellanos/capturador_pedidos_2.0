import { Prisma, PrismaClient } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

/**
 * Devuelve el siguiente código visible (ej. PED-0001) para un prefijo,
 * bloqueando la fila del consecutivo dentro de la transacción. Si la
 * transacción se revierte, el número no queda consumido.
 */
export async function siguienteCodigo(tx: Tx, prefijo: string): Promise<string> {
  const fila = await tx.$queryRaw<Array<{ ultimoValor: number; ancho: number }>>`
    SELECT "ultimoValor", "ancho"
    FROM "consecutivos"
    WHERE "tipo" = ${prefijo} AND "periodo" = 'global'
    FOR UPDATE
  `;

  let ultimo = 0;
  let ancho = 4;
  if (fila.length > 0) {
    ultimo = fila[0].ultimoValor;
    ancho = fila[0].ancho;
  }

  const siguiente = ultimo + 1;

  // `actualizadoEn` se escribe explícitamente: el SQL crudo no ejecuta el
  // @updatedAt de Prisma y la columna es NOT NULL en la base.
  await tx.$executeRaw`
    INSERT INTO "consecutivos" ("tipo", "periodo", "prefijo", "ancho", "ultimoValor", "actualizadoEn")
    VALUES (${prefijo}, 'global', ${prefijo}, ${ancho}, ${siguiente}, now())
    ON CONFLICT ("tipo", "periodo")
    DO UPDATE SET "ultimoValor" = EXCLUDED."ultimoValor", "actualizadoEn" = now()
  `;

  return `${prefijo}-${String(siguiente).padStart(ancho, "0")}`;
}

/** Calcula la cantidad de un monto Decimal sin perder precisión básica (COP). */
export function numero(decimal: Prisma.Decimal | number | string | null | undefined): number {
  if (decimal === null || decimal === undefined) return 0;
  return Number(decimal.toString());
}
