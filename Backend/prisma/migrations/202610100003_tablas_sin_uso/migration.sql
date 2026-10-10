-- Los flujos vigentes no leen ni escriben estas tablas. Nunca borrar historial.
BEGIN;
LOCK TABLE "recordatoriosCredito", "cierrePedidos", "cierreMovimientos" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "recordatoriosCredito")
    OR EXISTS (SELECT 1 FROM "cierrePedidos")
    OR EXISTS (SELECT 1 FROM "cierreMovimientos") THEN
    RAISE EXCEPTION 'Hay registros en tablas antiguas; conservarlos y revisar antes de continuar';
  END IF;
END $$;

DROP TABLE "recordatoriosCredito";
DROP TABLE "cierrePedidos";
DROP TABLE "cierreMovimientos";
COMMIT;
