-- Índices aditivos: no se borran ni transforman datos comerciales.
CREATE INDEX "pedidos_creadoEn_id_idx" ON "pedidos"("creadoEn", "id");
CREATE INDEX "pedidos_fechaOperacion_creadoEn_id_idx" ON "pedidos"("fechaOperacion", "creadoEn", "id");
CREATE INDEX "pedidos_estado_creadoEn_id_idx" ON "pedidos"("estado", "creadoEn", "id");
