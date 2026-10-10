ALTER TABLE "conteoLineas" ADD COLUMN "asignadoPorId" text, ADD COLUMN "asignadoHasta" timestamp(3);
ALTER TABLE "conteoLineas" ADD CONSTRAINT "conteoLineas_asignadoPorId_fkey" FOREIGN KEY ("asignadoPorId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "conteoLineas_conteoId_stockFisico_asignadoHasta_idx" ON "conteoLineas"("conteoId", "stockFisico", "asignadoHasta");
CREATE TABLE "participantesConteo" (
 "conteoId" text NOT NULL REFERENCES "conteosInventario"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "usuarioId" text NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "primeroEn" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "ultimoEn" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("conteoId", "usuarioId")
);
INSERT INTO "participantesConteo" ("conteoId","usuarioId","primeroEn","ultimoEn")
 SELECT "conteoId", "contadoPorId", MIN("contadoEn"), MAX("contadoEn") FROM "conteoLineas"
 WHERE "contadoPorId" IS NOT NULL AND "contadoEn" IS NOT NULL GROUP BY "conteoId","contadoPorId";

CREATE CONSTRAINT TRIGGER invalidar_sincronizacion AFTER INSERT OR UPDATE OR DELETE ON "participantesConteo" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invalidar_sincronizacion();
