-- Conservar documentos históricos sin atribuirles el costo actual del catálogo.
ALTER TABLE "conteoLineas" ADD COLUMN "costoUnitarioConteo" numeric(18,2);
ALTER TABLE "ajusteLineas" ADD COLUMN "costoUnitario" numeric(18,2);
ALTER TABLE "conteoLineas" ADD CONSTRAINT "conteoLineas_costo_no_negativo" CHECK ("costoUnitarioConteo" >= 0);
ALTER TABLE "ajusteLineas" ADD CONSTRAINT "ajusteLineas_costo_no_negativo" CHECK ("costoUnitario" >= 0);
CREATE INDEX "conteosInventario_estado_finalizadoEn_idx" ON "conteosInventario" (estado, "finalizadoEn");
CREATE INDEX "ajustesInventario_creadoEn_idx" ON "ajustesInventario" ("creadoEn");
-- El tablero ahora depende también de confirmaciones y ajustes sin venta.
DO $$ DECLARE tabla text; BEGIN
  FOREACH tabla IN ARRAY ARRAY['conteosInventario','conteoLineas','ajustesInventario','ajusteLineas'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER invalidar_dashboard AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invalidar_dashboard()', tabla);
  END LOOP;
END $$;
