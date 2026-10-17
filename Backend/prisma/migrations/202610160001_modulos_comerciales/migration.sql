CREATE TABLE "configuracionesAccesoComercial" (
  "id" TEXT PRIMARY KEY,
  "configuracion" JSONB NOT NULL,
  "actualizadoEn" TIMESTAMP(3) NOT NULL
);
CREATE CONSTRAINT TRIGGER invalidar_sincronizacion AFTER INSERT OR UPDATE OR DELETE
ON "configuracionesAccesoComercial" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION invalidar_sincronizacion();
