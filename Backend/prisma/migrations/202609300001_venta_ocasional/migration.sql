ALTER TABLE "pedidos" ALTER COLUMN "clienteId" DROP NOT NULL;
ALTER TABLE "facturas" ALTER COLUMN "clienteId" DROP NOT NULL;
ALTER TABLE "pagos" ALTER COLUMN "clienteId" DROP NOT NULL;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedido_ocasional_sin_credito" CHECK ("clienteId" IS NOT NULL OR "metodo" <> 'credito');
ALTER TABLE "pagos" ADD CONSTRAINT "pago_ocasional_sin_credito" CHECK ("clienteId" IS NOT NULL OR "metodo" <> 'credito');
