-- Solo metadatos: no modifica ni elimina documentos del negocio.
ALTER TABLE "auditoriaEventos"
  ADD COLUMN "esPrueba" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "empresaId" TEXT,
  ADD COLUMN "usuarioObjetivoId" TEXT;
CREATE INDEX "auditoriaEventos_esPrueba_creadoEn_idx" ON "auditoriaEventos"("esPrueba", "creadoEn");
