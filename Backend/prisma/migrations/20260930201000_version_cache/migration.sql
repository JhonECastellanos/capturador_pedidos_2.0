CREATE TABLE "versionesCache" (id text PRIMARY KEY, version bigint NOT NULL DEFAULT 0, transaccion bigint NOT NULL DEFAULT 0);
INSERT INTO "versionesCache" (id) VALUES ('dashboard');
CREATE FUNCTION invalidar_dashboard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "versionesCache" SET version = version + 1, transaccion = txid_current()
  WHERE id = 'dashboard' AND transaccion <> txid_current();
  RETURN NULL;
END;
$$;
-- Al confirmar, una sola revisión por transacción. Un rollback no invalida.
-- Cubre también escrituras SQL y evita una ventana entre commit e invalidación.
DO $$ DECLARE tabla text; BEGIN
  FOREACH tabla IN ARRAY ARRAY['pedidos','pedidoLineas','pagos','pagoAplicaciones','productos','clientes','gastos','recepcionesCompra'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER invalidar_dashboard AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invalidar_dashboard()', tabla);
  END LOOP;
END $$;
