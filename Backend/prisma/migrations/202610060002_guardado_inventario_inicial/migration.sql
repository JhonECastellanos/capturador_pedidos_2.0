CREATE TABLE "escriturasConfirmadas" (
  "usuarioId" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "ruta" TEXT NOT NULL,
  "huella" TEXT NOT NULL,
  "respuesta" JSONB NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "escriturasConfirmadas_pkey" PRIMARY KEY ("usuarioId", "clave"),
  CONSTRAINT "escriturasConfirmadas_usuario_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT
);
ALTER TABLE "conteoLineas" ADD COLUMN "nombreInicial" TEXT,
  ADD COLUMN "costoUnitarioInicial" DECIMAL(18,2),
  ADD COLUMN "deltaAcumuladoInicial" BIGINT,
  ADD CONSTRAINT "conteoLineas_costo_inicial_no_negativo" CHECK ("costoUnitarioInicial" >= 0);
-- Un inicio en curso o confirmado por instalación. Cancelarlo permite comenzar de nuevo.
CREATE UNIQUE INDEX "conteosInventario_inicial_unico" ON "conteosInventario" ("tipo")
  WHERE "tipo" = 'inicial' AND "estado" <> 'cancelado';
-- La aplicación ya usa un candado; la base también impide aplicar dos veces.
CREATE UNIQUE INDEX "ajustesInventario_conteo_unico" ON "ajustesInventario" ("conteoId") WHERE "conteoId" IS NOT NULL;
