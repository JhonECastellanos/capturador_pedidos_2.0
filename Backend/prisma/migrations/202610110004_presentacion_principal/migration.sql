ALTER TABLE productos DROP CONSTRAINT "producto_presentacion_valida";
ALTER TABLE productos ADD CONSTRAINT "producto_presentacion_valida" CHECK ("productoBaseId" IS NULL OR ("productoBaseId"<>id AND length(btrim(extension))>0));
DROP INDEX "producto_presentacion_unica";
CREATE UNIQUE INDEX "producto_presentacion_unica" ON productos (COALESCE("productoBaseId",id), lower(btrim(extension)));
