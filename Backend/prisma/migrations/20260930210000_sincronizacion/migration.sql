INSERT INTO "versionesCache" (id) VALUES ('sincronizacion');
CREATE FUNCTION invalidar_sincronizacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "versionesCache" SET version = version + 1, transaccion = txid_current()
  WHERE id = 'sincronizacion' AND transaccion <> txid_current();
  RETURN NULL;
END;
$$;
-- Se publica únicamente lo confirmado. Sesiones y consecutivos no generan
-- refrescos; el guard comprueba la sesión en cada consulta.
DO $$ DECLARE tabla text; BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'usuarios','roles','permisos','rolPermisos','categorias','tiposCredito',
    'clientes','recordatoriosCredito','productos','proveedores','archivosAdjuntos',
    'pedidos','pedidoLineas','pedidoEstadoHistorial','facturas','pagos','pagoAplicaciones',
    'reservasStock','movimientosInventario','conteosInventario','conteoLineas',
    'ajustesInventario','ajusteLineas','cambiosPrecio','recepcionesCompra','recepcionLineas',
    'gastos','movimientosCaja','cierresDia','cierreMedios','cierrePedidos','cierreMovimientos','cierreAcciones'
  ] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER invalidar_sincronizacion AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invalidar_sincronizacion()', tabla);
  END LOOP;
END $$;
