ALTER TABLE usuarios ADD COLUMN "permisosDenegados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE usuarios ADD COLUMN "eliminadoEn" TIMESTAMP(3);
CREATE TABLE "configuracionesVisuales" (
  id TEXT PRIMARY KEY,
  configuracion JSONB NOT NULL,
  "actualizadoEn" TIMESTAMP(3) NOT NULL
);
CREATE CONSTRAINT TRIGGER invalidar_sincronizacion AFTER INSERT OR UPDATE OR DELETE ON "configuracionesVisuales" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invalidar_sincronizacion();

ALTER TABLE usuarios ADD CONSTRAINT system_acceso_protegido CHECK (NOT "esSistema" OR ("eliminadoEn" IS NULL AND cardinality("permisosDenegados") = 0));
