BEGIN;
-- Las transiciones actuales consumen o liberan toda la línea, sin parciales.
-- Corregir sus contadores no cambia el stock ni genera movimientos nuevos.
UPDATE "reservasStock" SET
  "cantidadConsumida" = CASE WHEN estado = 'consumida' THEN "cantidadReservada" ELSE 0 END,
  "cantidadLiberada" = CASE WHEN estado = 'liberada' THEN "cantidadReservada" ELSE 0 END
WHERE "cantidadConsumida" <> CASE WHEN estado = 'consumida' THEN "cantidadReservada" ELSE 0 END
   OR "cantidadLiberada" <> CASE WHEN estado = 'liberada' THEN "cantidadReservada" ELSE 0 END;
-- Ejecutar los triggers diferidos antes de modificar la tabla, en la misma transacción.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "reservasStock" ADD CONSTRAINT "reservasStock_cantidades_estado_coherentes" CHECK (
  (estado = 'reservada' AND "cantidadConsumida" = 0 AND "cantidadLiberada" = 0) OR
  (estado = 'consumida' AND "cantidadConsumida" = "cantidadReservada" AND "cantidadLiberada" = 0) OR
  (estado = 'liberada' AND "cantidadLiberada" = "cantidadReservada" AND "cantidadConsumida" = 0)
);
COMMIT;
