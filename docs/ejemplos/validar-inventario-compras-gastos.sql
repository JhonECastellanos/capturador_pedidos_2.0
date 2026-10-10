-- Solo lectura. Ejecutar con psql -v desde=2026-10-01 -v hasta=2026-10-31 -f este_archivo.sql
-- Ajustar las fechas al período que se quiere conciliar en el frontend.
\set ON_ERROR_STOP on
BEGIN READ ONLY;

-- Catálogo: físico, reservado, disponible y acumulado del libro de movimientos.
SELECT p."codigoInterno", p.nombre, p.unidad, p."precioVenta", p."costoActual",
  p."stockFisico", p."stockReservado", p."stockFisico"-p."stockReservado" AS disponible,
  p."stockMinimo", COALESCE(m.fisico,0) AS fisico_segun_movimientos,
  p."stockFisico"-COALESCE(m.fisico,0) AS diferencia_libro
FROM productos p
LEFT JOIN (SELECT "productoId", SUM("deltaStockFisico") AS fisico FROM "movimientosInventario" GROUP BY "productoId") m ON m."productoId"=p.id
ORDER BY p.nombre;

-- Conteos: lo digitado, cuándo y quién contó, costo guardado y ajuste vinculado.
SELECT c.id AS conteo, c.tipo, c.estado, c."fechaDiaria", c.turno, c."finalizadoEn",
  p."codigoInterno", p.nombre, l."stockTeorico", l."stockFisico", l.diferencia,
  l."costoUnitarioConteo", l.diferencia*l."costoUnitarioConteo" AS importe_neto,
  l."contadoEn", u.nombre AS contado_por, a.id AS ajuste,
  CASE WHEN l."stockFisico" IS NULL THEN NULL ELSE l.diferencia=l."stockFisico"-l."stockTeorico" END AS diferencia_correcta
FROM "conteosInventario" c JOIN "conteoLineas" l ON l."conteoId"=c.id
JOIN productos p ON p.id=l."productoId" LEFT JOIN usuarios u ON u.id=l."contadoPorId"
LEFT JOIN "ajustesInventario" a ON a."conteoId"=c.id
WHERE (COALESCE(c."finalizadoEn",c."iniciadoEn") AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date BETWEEN :'desde'::date AND :'hasta'::date
ORDER BY c."iniciadoEn",p.nombre;

-- Progreso y colaboradores por inventario, sin duplicar líneas al unir participantes.
SELECT c.id,c.tipo,c.estado,c."iniciadoEn",c."finalizadoEn",
 (SELECT COUNT(*) FROM "conteoLineas" l WHERE l."conteoId"=c.id) AS productos,
 (SELECT COUNT(*) FROM "conteoLineas" l WHERE l."conteoId"=c.id AND l."stockFisico" IS NOT NULL) AS contados,
 (SELECT COUNT(*) FROM "participantesConteo" pc WHERE pc."conteoId"=c.id) AS colaboradores
FROM "conteosInventario" c ORDER BY c."iniciadoEn" DESC;
SELECT pc."conteoId",u.nombre,pc."primeroEn",pc."ultimoEn" FROM "participantesConteo" pc JOIN usuarios u ON u.id=pc."usuarioId" ORDER BY pc."conteoId",u.nombre;
SELECT l."conteoId",p.nombre,u.nombre AS contando,l."asignadoHasta" FROM "conteoLineas" l JOIN productos p ON p.id=l."productoId" JOIN usuarios u ON u.id=l."asignadoPorId" WHERE l."stockFisico" IS NULL AND l."asignadoHasta">CURRENT_TIMESTAMP;

-- Descuadres por día, semana (lunes), mes y año: la misma definición del Inicio.
-- El inicial, borradores y cancelados no se suman. Un ajuste de conteo no se suma otra vez.
WITH diferencias AS (
 SELECT (c."finalizadoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date AS dia,
   l.diferencia,l."costoUnitarioConteo" AS costo
 FROM "conteosInventario" c JOIN "conteoLineas" l ON l."conteoId"=c.id
 WHERE c.estado='confirmado' AND c.tipo<>'inicial' AND l."stockFisico" IS NOT NULL AND l.diferencia<>0
 UNION ALL
 SELECT (a."creadoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date,l.diferencia,l."costoUnitario"
 FROM "ajustesInventario" a JOIN "ajusteLineas" l ON l."ajusteInventarioId"=a.id
 WHERE a."conteoId" IS NULL AND a.estado='aplicado' AND l.diferencia<>0
), periodos AS (SELECT * FROM (VALUES ('Día','day'),('Semana','week'),('Mes','month'),('Año','year')) AS p(etiqueta,unidad))
SELECT p.etiqueta AS periodo,date_trunc(p.unidad,d.dia::timestamp)::date AS inicio,
 COALESCE(SUM(GREATEST(-d.diferencia,0)*d.costo),0) AS faltantes,
 COALESCE(SUM(GREATEST(d.diferencia,0)*d.costo),0) AS sobrantes,
 COALESCE(SUM(d.diferencia*d.costo),0) AS neto,
 COUNT(*) FILTER (WHERE d.costo IS NULL) AS lineas_sin_costo
FROM diferencias d CROSS JOIN periodos p
WHERE d.dia BETWEEN :'desde'::date AND :'hasta'::date
GROUP BY p.etiqueta,p.unidad,date_trunc(p.unidad,d.dia::timestamp) ORDER BY p.etiqueta,inicio;

-- Compras: líneas y total histórico; el precio del catálogo no recalcula la compra.
SELECT r.numero,r."fechaOperacion",v.nombre AS proveedor,r."descontarCaja",r.total,
 COALESCE(SUM(l.subtotal),0) AS suma_lineas,r.total=COALESCE(SUM(l.subtotal),0) AS total_correcto,
 COALESCE(bool_and(l.subtotal=l.cantidad*l."costoUnitario"),true) AS lineas_correctas
FROM "recepcionesCompra" r JOIN proveedores v ON v.id=r."proveedorId"
LEFT JOIN "recepcionLineas" l ON l."recepcionCompraId"=r.id
WHERE r."fechaOperacion" BETWEEN :'desde'::date AND :'hasta'::date
GROUP BY r.id,v.nombre ORDER BY r."fechaOperacion",r.numero;

-- Gastos y su salida de caja: un gasto, una salida; comparar con el listado del módulo.
SELECT g.id,g."fechaOperacion",g.concepto,g.monto,g.metodo,g.estado,
 COALESCE(SUM(CASE WHEN m.tipo='egreso' THEN m.monto ELSE -m.monto END),0) AS egreso_caja
FROM gastos g LEFT JOIN "movimientosCaja" m ON m."gastoId"=g.id
WHERE g."fechaOperacion" BETWEEN :'desde'::date AND :'hasta'::date
GROUP BY g.id ORDER BY g."fechaOperacion",g.id;

-- Totales completos del rango para comparar con las tarjetas (no suman solo la página visible).
SELECT (SELECT COALESCE(SUM(total),0) FROM "recepcionesCompra" WHERE "fechaOperacion" BETWEEN :'desde'::date AND :'hasta'::date) AS compras,
 (SELECT COALESCE(SUM(monto),0) FROM gastos WHERE "fechaOperacion" BETWEEN :'desde'::date AND :'hasta'::date) AS gastos;

COMMIT;
