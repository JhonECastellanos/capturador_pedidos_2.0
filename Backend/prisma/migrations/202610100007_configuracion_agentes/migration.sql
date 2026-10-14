CREATE TABLE "configuracionesAgente" (
  "id" TEXT NOT NULL DEFAULT 'principal',
  "configuracion" JSONB NOT NULL,
  "secretos" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "configuracionesAgente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "configuracionesAgente_version_positiva" CHECK ("version" > 0)
);
