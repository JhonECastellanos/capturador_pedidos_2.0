-- La clave única declarada en Prisma reemplaza el índice parcial anterior.
-- Los ajustes manuales siguen admitiendo conteoId nulo.
DROP INDEX IF EXISTS "ajustesInventario_conteo_unico";
