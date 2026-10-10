-- Los conteos históricos se conservan; el ciclo comienza con los nuevos diarios.
ALTER TABLE "conteosInventario" ADD COLUMN "fechaDiaria" date;
ALTER TABLE "conteoLineas" ADD COLUMN "cicloDiario" integer;
ALTER TABLE "conteoLineas" ADD COLUMN "contadoPorId" text;
ALTER TABLE "conteoLineas" ADD CONSTRAINT "conteoLineas_contadoPorId_fkey"
  FOREIGN KEY ("contadoPorId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
-- Fallar ante un vínculo roto o un ajuste duplicado, sin borrar registros.
CREATE UNIQUE INDEX "ajustesInventario_conteoId_key" ON "ajustesInventario" ("conteoId");
ALTER TABLE "ajustesInventario" ADD CONSTRAINT "ajustesInventario_conteoId_fkey"
  FOREIGN KEY ("conteoId") REFERENCES "conteosInventario"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conteoLineas" ADD CONSTRAINT "conteoLineas_ciclo_positivo"
  CHECK ("cicloDiario" IS NULL OR "cicloDiario" > 0);
ALTER TABLE "conteosInventario" ADD CONSTRAINT "conteosInventario_fecha_diaria"
  CHECK ("fechaDiaria" IS NULL OR tipo = 'aleatorio');
CREATE UNIQUE INDEX "conteosInventario_diario_activo"
  ON "conteosInventario" ("fechaDiaria")
  WHERE "fechaDiaria" IS NOT NULL AND estado <> 'cancelado';
CREATE INDEX "conteoLineas_cicloDiario_productoId_idx"
  ON "conteoLineas" ("cicloDiario", "productoId");
