ALTER TABLE productos ADD COLUMN "precioPendiente" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "codigosProducto" (
  id TEXT NOT NULL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  "productoId" TEXT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiradoEn" TIMESTAMP(3)
);
CREATE INDEX "codigosProducto_productoId_retiradoEn_idx" ON "codigosProducto"("productoId", "retiradoEn");
CREATE CONSTRAINT TRIGGER invalidar_sincronizacion AFTER INSERT OR UPDATE OR DELETE ON "codigosProducto" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invalidar_sincronizacion();
