CREATE TABLE "notificaciones" (
  "id" TEXT PRIMARY KEY, "tipo" TEXT NOT NULL, "titulo" TEXT NOT NULL,
  "ruta" TEXT NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "notificaciones_creadoEn_id_idx" ON "notificaciones"("creadoEn", "id");
CREATE TABLE "lecturasNotificacion" (
  "notificacionId" TEXT NOT NULL REFERENCES "notificaciones"("id") ON DELETE CASCADE,
  "usuarioId" TEXT NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE, "leidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("notificacionId", "usuarioId")
);
CREATE FUNCTION aviso_documento_comercial() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE texto TEXT; destino TEXT; clase TEXT;
BEGIN
  IF TG_TABLE_NAME = 'pedidos' THEN
    clase := 'pedido'; destino := '/admin/ventas/pedido/' || NEW.id;
    IF TG_OP = 'INSERT' THEN texto := 'Nuevo pedido ' || NEW.numero;
    ELSIF OLD.estado IS DISTINCT FROM NEW.estado THEN texto := NEW.numero || ': ' || replace(NEW.estado::text, '-', ' ');
    ELSE RETURN NEW; END IF;
  ELSE
    clase := 'compra'; destino := '/admin/compras?recepcion=' || NEW.id;
    texto := 'Compra recibida ' || NEW.numero;
  END IF;
  INSERT INTO "notificaciones"("id", "tipo", "titulo", "ruta") VALUES (gen_random_uuid()::text, clase, texto, destino);
  RETURN NEW;
END $$;
CREATE TRIGGER aviso_pedido AFTER INSERT OR UPDATE OF estado ON "pedidos" FOR EACH ROW EXECUTE FUNCTION aviso_documento_comercial();
CREATE TRIGGER aviso_compra AFTER INSERT ON "recepcionesCompra" FOR EACH ROW EXECUTE FUNCTION aviso_documento_comercial();
