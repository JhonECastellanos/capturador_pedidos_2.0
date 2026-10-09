# Validar formularios y PostgreSQL

El navegador mantiene el borrador hasta confirmar. La API valida la operación y responde después de confirmar su transacción en PostgreSQL. Una respuesta correcta significa que el documento ya está guardado; la actualización de otra pantalla puede tardar el intervalo de sincronización de dos segundos más la lectura. No se debe repetir una venta porque una tarjeta aún no se haya actualizado.

## Abrir una conexión de consulta

Desde la raíz del proyecto, en PowerShell, para consultar la instalación local del negocio:

```powershell
$usuarioConsulta = (docker.exe compose exec -T postgres printenv POSTGRES_USER).Trim()
$baseConsulta = (docker.exe compose exec -T postgres printenv POSTGRES_DB).Trim()
docker.exe compose exec postgres psql -U $usuarioConsulta -d $baseConsulta
```

No hace falta publicar PostgreSQL ni compartir contraseñas. Para QA, añadir `-p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml` después de `compose` en las tres instrucciones. QA usa `ambie_test` y el frontend `http://localhost:8180`; el negocio usa `http://localhost:8080`. Verificar la conexión antes de consultar:

```sql
SELECT current_database(), current_user;
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
```

Ejecutar las consultas siguientes dentro de esa instantánea y terminar con `ROLLBACK;`. `\q` cierra psql. Cada bloque es de lectura y no modifica datos. Cambiar el consecutivo de ejemplo por el que muestra el pedido. Usar las mismas fechas y filtros que la pantalla, sin sumar únicamente la primera página de una lista.

## Formulario de cliente

```sql
SELECT id, codigo, nombre, alias, telefono, ciudad, direccion,
       "fechaNacimiento", "tipoCreditoId", activo, "creadoEn"
FROM clientes
ORDER BY "creadoEn" DESC, id DESC LIMIT 10;
```

Comparar nombre, teléfono, dirección y nacimiento con lo digitado. `id` es la identidad interna, `codigo` el consecutivo visible y `tipoCreditoId` relaciona `tiposCredito`. Teléfono y nombre no son claves únicas: dos personas pueden compartirlos. No usar una coincidencia de nombre para concluir que son el mismo cliente.

## Pedido, cantidades y precios históricos

```sql
SELECT p.id, p.numero, p.estado, p.metodo, p."momentoCobro",
       p."clienteId", p."vendedorId", p."fechaOperacion", p.total,
       COALESCE(SUM(l.subtotal), 0) AS suma_lineas,
       p.total = COALESCE(SUM(l.subtotal), 0) AS total_correcto
FROM pedidos p LEFT JOIN "pedidoLineas" l ON l."pedidoId" = p.id
WHERE p.numero = 'PED-000001'
GROUP BY p.id;

SELECT l."productoId", l."codigoInterno", l.nombre, l.cantidad,
       l."precioUnitario", l.subtotal,
       l.cantidad * l."precioUnitario" = l.subtotal AS linea_correcta
FROM "pedidoLineas" l JOIN pedidos p ON p.id = l."pedidoId"
WHERE p.numero = 'PED-000001' ORDER BY l.orden;
```

La venta ocasional tiene `clienteId` nulo; crédito exige cliente. `pedidoLineas` conserva nombre, unidad, precio y costo del momento de venta. Comparar el detalle de la factura con esas líneas, aunque después cambie el precio del catálogo. Las facturas se relacionan con el pedido; no se suman otra vez como ventas adicionales.

## Cobros, saldo y caja

```sql
SELECT p.numero, p.total,
       COALESCE(a.pagado, 0) AS pagado,
       CASE WHEN p.estado = 'cancelado' THEN 0
            ELSE GREATEST(p.total - COALESCE(a.pagado, 0), 0) END AS saldo
FROM pedidos p
LEFT JOIN LATERAL (
  SELECT SUM("montoAplicado") AS pagado FROM "pagoAplicaciones"
  WHERE "pedidoId" = p.id AND "revertidoEn" IS NULL
) a ON true
WHERE p.numero = 'PED-000001';

SELECT m.id, m.tipo, m.concepto, m.metodo, m.monto,
       m."fechaContable", m."reversionDeMovimientoId"
FROM "movimientosCaja" m
WHERE m."pagoId" IN (
  SELECT a."pagoId" FROM "pagoAplicaciones" a
  JOIN pedidos p ON p.id = a."pedidoId" WHERE p.numero = 'PED-000001'
)
ORDER BY m."creadoEn", m.id;

SELECT metodo,
       COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(monto) FILTER (WHERE tipo = 'egreso'), 0) AS egresos,
       COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS neto
FROM "movimientosCaja"
WHERE "fechaContable" = (now() AT TIME ZONE 'America/Bogota')::date
GROUP BY metodo;
```

`pagos` registra el dinero recibido; `pagoAplicaciones` lo distribuye entre pedidos. Un abono FIFO puede pagar varios documentos: no sumar el monto completo del pago por cada aplicación. Los reversos permanecen como trazabilidad; excluir aplicaciones revertidas al calcular deuda e incluir ingresos y egresos al calcular caja. El dinero asociado a un abono compartido no pertenece exclusivamente a un pedido. Una venta entregada en efectivo y cobrada al momento debe tener líneas, pago aplicado y movimiento de ingreso por su total. Las ventas a crédito y las compras sin descuento de caja producen diferencias legítimas entre ventas y caja.

## Inicio: ventas y ticket del mes

```sql
WITH periodo AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date AS desde,
         (now() AT TIME ZONE 'America/Bogota')::date AS hasta
), ventas AS (
  SELECT COALESCE(SUM(p.total), 0) AS total, COUNT(*) AS pedidos
  FROM pedidos p, periodo f
  WHERE p.estado <> 'cancelado' AND p."fechaOperacion" BETWEEN f.desde AND f.hasta
), compras AS (
  SELECT COALESCE(SUM(c.total), 0) AS total FROM "recepcionesCompra" c, periodo f
  WHERE c."fechaOperacion" BETWEEN f.desde AND f.hasta
), gastos_mes AS (
  SELECT COALESCE(SUM(g.monto), 0) AS total FROM gastos g, periodo f
  WHERE g."fechaOperacion" BETWEEN f.desde AND f.hasta
)
SELECT v.total AS ventas, v.pedidos, c.total AS compras, g.total AS gastos,
       c.total + g.total AS compras_y_gastos,
       CASE WHEN v.pedidos = 0 THEN 0 ELSE ROUND(v.total / v.pedidos, 2) END AS ticket_promedio
FROM ventas v, compras c, gastos_mes g;
```

Comparar con las tarjetas del mes calendario de Inicio. Las ventas incluyen pedidos vigentes según su fecha operativa; no equivalen únicamente a cobros recibidos. Cada tabla se agrega por separado para evitar multiplicar importes al unir líneas, pagos y gastos. La interfaz puede redondear la presentación monetaria; la API conserva dos decimales. Para un día, cambiar `desde` y `hasta` por la misma fecha.

## Inventario

```sql
SELECT p."codigoInterno", p.nombre, p."stockFisico", p."stockReservado",
       p."stockFisico" - p."stockReservado" AS disponible,
       COALESCE(r.cantidad, 0) AS reserva_en_documentos,
       p."stockReservado" = COALESCE(r.cantidad, 0) AS reserva_correcta
FROM productos p
LEFT JOIN LATERAL (
  SELECT SUM("cantidadReservada") AS cantidad FROM "reservasStock"
  WHERE "productoId" = p.id AND estado = 'reservada'
) r ON true
ORDER BY p."codigoInterno";
```

`productos` conserva el físico y reservado actuales. `reservasStock` explica pedidos abiertos; `movimientosInventario` documenta cambios. `conteosInventario`/`conteoLineas` conservan lo contado, incluido el punto de partida del inventario inicial; `ajustesInventario`/`ajusteLineas` registran su aplicación. Digitar un conteo no aplica automáticamente el ajuste. Reutilizar la confirmación del módulo y consultar [el diccionario de tablas y campos](DICCIONARIO_DATOS_V4P2.md).

## Reintentos y comprobaciones

La misma intención conserva `Idempotency-Key` al reintentar una respuesta incierta. `escriturasConfirmadas` contiene una confirmación por usuario/clave: no es otra venta ni debe sumarse en reportes. Una nueva operación legítima obtiene otra clave. Ver [guardado y conciliación](GUARDADO_Y_CONCILIACION_V4P2.md) para las restricciones y cobertura.

Los ejercicios del navegador usan formularios reales y PostgreSQL QA. `npm.cmd run prueba:paneles` comprueba filtros, borradores, sincronización, un cliente nuevo y una venta ocasional de dos líneas; registra tiempos y conciliación en `.local/pruebas-ui/conciliacion-formularios.json`. Preparar primero `npm.cmd run demo:catalogo` exclusivamente en QA. La medición desde el clic hasta la respuesta incluye navegador/red/servidor; la consulta posterior incluye arrancar psql mediante Docker. No mide por separado el instante interno del commit ni garantiza la misma latencia en otro servidor.

## Comprobaciones realizadas el 9 de octubre de 2026

Los 18 casos de integración QA aprobaron permisos, sesiones, transacciones, reserva de stock, concurrencia, pagos FIFO, cancelación, compras, gastos, cierre y precios históricos. Los reintentos secuenciales y simultáneos conservaron un solo pedido y cobro por clave; los rechazos y rollback no dejaron documentos parciales. Aprobaron también dos pruebas de caché, dos de claves de guardado y seis de renovación de sesión.

En la instalación del negocio se ejecutaron los cinco bloques de consulta de esta guía en transacciones de lectura. Las nueve ventas del mes suman $121.600 y su ticket promedio es $13.511,11; compras y gastos son cero. No se encontraron diferencias entre subtotales y cantidades por precio, entre totales y suma de líneas, ni entre stock reservado y reservas activas. La caja neta es $39.900: ventas y caja representan conceptos distintos y no deben igualarse sin revisar pagos y crédito. Se conservaron 8 clientes, 32 productos, 9 pedidos, 4 pagos y 4 movimientos de caja, sin escribir operaciones comerciales en producción.
