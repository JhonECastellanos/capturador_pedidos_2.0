ALTER TABLE productos ADD COLUMN "productoBaseId" TEXT;
ALTER TABLE productos ADD COLUMN extension TEXT NOT NULL DEFAULT '';
ALTER TABLE productos ADD CONSTRAINT "productos_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE productos ADD CONSTRAINT "producto_presentacion_valida" CHECK (("productoBaseId" IS NULL AND extension='') OR ("productoBaseId" IS NOT NULL AND "productoBaseId"<>id AND length(btrim(extension))>0));
CREATE UNIQUE INDEX "producto_presentacion_unica" ON productos ("productoBaseId", lower(btrim(extension))) WHERE "productoBaseId" IS NOT NULL;
CREATE INDEX "productos_productoBaseId_idx" ON productos ("productoBaseId");
CREATE FUNCTION validar_base_presentacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."productoBaseId" IS NOT NULL AND EXISTS(SELECT 1 FROM productos WHERE id=NEW."productoBaseId" AND "productoBaseId" IS NOT NULL) THEN RAISE EXCEPTION 'La presentación debe pertenecer a un producto principal'; END IF;
 IF NEW."productoBaseId" IS NOT NULL AND EXISTS(SELECT 1 FROM productos WHERE "productoBaseId"=NEW.id) THEN RAISE EXCEPTION 'Un producto con presentaciones no puede convertirse en presentación'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_base_presentacion BEFORE INSERT OR UPDATE OF "productoBaseId" ON productos FOR EACH ROW EXECUTE FUNCTION validar_base_presentacion();

CREATE VIEW "identidadesProducto" AS SELECT COALESCE("productoBaseId",id) AS rowid, id AS rowid_ext, "codigoInterno", nombre, extension FROM productos;
