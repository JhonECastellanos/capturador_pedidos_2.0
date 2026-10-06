# Guardado y conciliación de datos — V4P2

PostgreSQL es la fuente de verdad de una instalación del negocio. La pantalla captura un borrador; el servidor valida permisos y reglas, calcula los importes y confirma las tablas relacionadas en una transacción. El navegador muestra la confirmación después de recibir esa respuesta. No hay una cola que guarde ventas más tarde.

El [diccionario completo](DICCIONARIO_DATOS_V4P2.md) explica las 38 tablas y sus 335 columnas físicas. El [modelo de datos](modelo-datos.md) relaciona las pantallas con esas tablas. El esquema y las migraciones de `Backend/prisma/` son las fuentes para comprobar tipos, claves y restricciones.

## Del formulario a la base

1. La persona captura o corrige los datos en la pantalla. El borrador no es una venta ni un movimiento de caja. La confirmación manual o por voz utiliza el guardado normal del formulario.
2. `Frontend/src/data/api.ts` envía la operación con cookie de sesión y `Idempotency-Key`. `guardados.ts` crea un UUID por intención de guardado. Si no se conoce el resultado por timeout, pérdida de conexión, respuesta ilegible o error 5xx, conserva esa clave para el siguiente envío de los mismos datos.
3. Solo se guardan la huella SHA-256 y el UUID pendientes en `sessionStorage`, nunca el formulario ni la respuesta. En un origen seguro (HTTPS o localhost), esa clave sobrevive a recargar la misma pestaña. Si el navegador bloquea ese almacenamiento o no ofrece Web Crypto en un origen HTTP inseguro, la protección del cliente permanece en RAM hasta cerrar/recargar. Login, logout y expiración limpian los intentos de la sesión anterior.
4. El guard de autenticación y los roles se comprueban antes del guardado y también antes de devolver una confirmación repetida. Renovar la sesión y volver a enviar no cambia la clave del intento.
5. `GuardadoInterceptor` abre una transacción PostgreSQL y toma un candado por usuario/clave. Dentro de esa misma transacción los servicios conservan sus bloqueos de productos, saldos y consecutivos. Sus bloques `$transaction` reutilizan la transacción activa; no confirman por separado. Fuera de una escritura protegida Prisma mantiene su comportamiento habitual.
6. Si la clave ya fue confirmada y la ruta/huella coinciden, devuelve el resultado original sin ejecutar otra vez el servicio ni la auditoría. Si los datos o la ruta son distintos, responde 409. El cuerpo capturado no se guarda en la tabla técnica: se conserva su huella y la confirmación de negocio, sin credenciales.
7. Si es un intento nuevo, se validan y guardan documento, líneas, dinero, reservas, stock, auditoría y `escriturasConfirmadas` según corresponda. El servidor responde **después del commit**. Un error revierte la operación y no consume la clave ni el consecutivo.
8. La pantalla invalida sus lecturas y espera la confirmación antes de cerrar. Si la lectura posterior falla, avisa que el documento ya fue guardado. Después de una confirmación conocida se retira la clave pendiente: otra venta legítima con los mismos productos recibe otra clave.

La protección cubre las escrituras de clientes, productos, pedidos y sus cobros, abonos, proveedores, recepciones, gastos, caja, inventario y cierres. Autenticación, configuración del asistente, usuarios y archivos conservan sus flujos actuales; no se almacenan sus respuestas ni credenciales en la tabla de confirmaciones. La carga de objetos en MinIO tiene un paso externo a PostgreSQL y no se presenta como una transacción distribuida.

Los clientes directos, CLI o integraciones que no envíen la cabecera conservan compatibilidad, pero **no obtienen protección de reintento**. Deben generar y conservar un UUID antes del primer envío y reutilizarlo solo para esa intención. No basta con desactivar un botón ni con comparar nombres, cantidades o precios: dos ventas legítimas pueden ser idénticas. La API no reenviará automáticamente una operación por iniciativa propia.

La confirmación técnica no es otra venta: la PK `(usuarioId, clave)` permite un único resultado. Su JSON es un comprobante privado del intento, separado de las tablas contables; nunca debe sumarse en informes. No tiene expiración automática que permita duplicar un reintento antiguo. Forma parte del respaldo y puede aumentar el espacio ocupado, por lo que cualquier política de archivo futura debe conservar la identidad de las operaciones confirmadas.

Una clave conocida se puede repetir después de reiniciar la API: la confirmación está en PostgreSQL, no en Redis ni en la memoria del proceso. En cambio, cambiar de datos, cerrar sesión o perder la clave del cliente crea otra intención. Ante una operación dudosa sin su clave, consultar primero el documento existente antes de registrarlo de nuevo.

## Qué guarda cada operación

| Confirmación de pantalla | Tablas y cambios relacionados |
|---|---|
| Crear producto | `productos`, `movimientosInventario` de inicialización y `consecutivos` |
| Crear pedido | `pedidos`, `pedidoLineas`, `pedidoEstadoHistorial`, `facturas`, `reservasStock`, `movimientosInventario`, stock reservado y consecutivos; si cobra de inmediato, también `pagos`, `pagoAplicaciones`, `movimientosCaja` |
| Entregar | estado/historial, consumo de reserva, físico/reservado y ledger; cobrar usa el flujo de pago elegido |
| Cancelar pedido abierto | estado/historial, liberación de reservas, reversos de aplicaciones/pagos/caja según corresponda; no se cancela un entregado |
| Abono general | `pagos`, `pagoAplicaciones` FIFO por creación/id y `movimientosCaja` |
| Cobro directo | las mismas tablas de dinero, aplicado exclusivamente al pedido indicado |
| Compra recibida | `recepcionesCompra`, `recepcionLineas`, físico, costo vigente y `movimientosInventario`; caja solo si se seleccionó descontarla |
| Gasto | `gastos` y egreso de `movimientosCaja` |
| Contar un producto | `conteoLineas`; todavía no cambia el físico del catálogo |
| Finalizar conteo | estado/fecha en `conteosInventario`; aplicado se determina por su ajuste |
| Aplicar conteo o ajuste manual | `ajustesInventario`, `ajusteLineas`, físico del catálogo y `movimientosInventario`, dentro de la misma transacción |
| Cerrar día | `cierresDia` y snapshots `cierreMedios`, `cierrePedidos`, `cierreMovimientos`, `cierreAcciones`, además de las acciones operativas del cierre |

Las escrituras protegidas también generan su confirmación técnica y metadatos de auditoría. Los triggers diferidos publican una revisión al confirmar. Rollback y reenvío de una clave confirmada no publican otra modificación del negocio.

La revisión de V4P2 encontró reservas consumidas/liberadas con sus cantidades en cero. Las tres transiciones existentes ahora actualizan estado, cantidad y fecha juntos. La migración corrige esos contadores históricos a la cantidad reservada según su estado, sin cambiar físico ni crear movimientos nuevos, y agrega un CHECK que impide volver a guardar esa incoherencia. Actualmente consumir o liberar afecta toda la línea; no hay entregas parciales en este flujo.

## Inventario inicial

Se reutiliza `POST /inventario/conteos` con `tipo: "inicial"`, los mismos campos de cantidades y los mismos botones de revisión. Solo está disponible para administradores en modo API.

- Abarca todos los productos activos del momento de apertura. Cada línea comienza sin contar; cero es un dato válido y distinto de `null`.
- Debe contarse todo antes de finalizar. La persona revisa el detalle y elige **Confirmar inventario inicial**. Finalizar el conteo todavía no aplica el físico.
- La confirmación final reutiliza `aplicar-ajuste`. Establece el stock en la cantidad contada; **no suma esa cantidad al stock que ya existía**. Mantiene las reservas y rechaza cantidades inferiores al reservado.
- Si cambió el físico desde la apertura, faltan líneas o cambió el conjunto de productos activos, se rechaza todo. Puede cancelarse un inicio confirmado pero aún sin aplicar y contarse nuevamente. Conviene hacer el ejercicio durante una pausa de operaciones.
- Crear productos y confirmar el inicio comparten un candado de catálogo: un alta simultánea termina antes de la comprobación o espera hasta después del commit del inicio. No puede entrar un producto nuevo entre la comprobación del catálogo y la confirmación.
- Al aplicar se conservan `nombreInicial`, `costoUnitarioInicial` y `deltaAcumuladoInicial` en `conteoLineas`. El físico contado ya existente representa la cantidad inicial. Se registra un movimiento `inicializacion` con el delta real y el origen conteo/ajuste, conservando el historial previo.
- Un índice parcial impide tener dos inicios en curso/confirmados. Otro índice impide dos ajustes del mismo conteo. Un inicio aplicado no puede cancelarse, volver a aplicarse ni editarse por los endpoints del conteo; los cambios posteriores usan ventas, compras y ajustes normales.
- La fecha de partida es la creación del ajuste aplicado, no la apertura del conteo. Si el negocio ya tenía ventas, este es su punto de adopción desde esa confirmación; no reconstruye un inicio histórico anterior.

`GET /inventario/inicial?page=1&q=...` devuelve la comparación, paginada a 30 productos. SQL calcula los totales sobre todo el inicio antes de recortar o filtrar la lista. Incluye los productos originales aunque después se desactiven; los creados después quedan fuera de esta comparación y continúan en Stock general.

```text
movimientoNeto = SUM(deltaStockFisico actual) − deltaAcumuladoInicial
stockEsperado = stockInicial + movimientoNeto
diferencia = stockFisico actual − stockEsperado
valorInicial = SUM(stockInicial × costoUnitarioInicial)
valorActualCostoInicial = SUM(stockFisico actual × costoUnitarioInicial)
```

El acumulado se toma dentro de la transacción, después del movimiento del inicio, mientras los productos están bloqueados. Así la comparación no depende de ordenar timestamps de transacciones que empezaron antes y terminaron después. Una compra cambia el costo actual del catálogo, pero conserva el costo y valor iniciales. El valor inicial representa existencias al costo: **no genera gasto, egreso de caja ni venta**, y no equivale a la utilidad. La comparación al costo inicial mantiene una base común; no sustituye una valoración al costo vigente.

## Cómo comparar la pantalla con PostgreSQL

Usar el UUID que devuelve el POST, no solo el nombre del cliente o el producto. Primero abrir `GET /pedidos/:id` o el documento correspondiente; luego consultar sus líneas, aplicaciones y movimientos por ese mismo id. Comparar el recurso completo, no únicamente la primera página. Una pantalla con una revisión antigua puede estar mostrando un snapshot anterior al commit.

| Dato visible | Comprobación correcta |
|---|---|
| Stock general `stock` | `productos.stockFisico - productos.stockReservado` (disponible), no solo físico |
| Total del pedido | `pedidos.total` y suma de `pedidoLineas.subtotal`; precios históricos de las líneas |
| Pagado / saldo | aplicaciones no revertidas de pagos activos; saldo no negativo, excluyendo cancelados de cartera |
| Caja | ingresos menos egresos de `movimientosCaja` por fecha contable y medio; no sumar otra vez el total de ventas |
| Ventas del mes | pedidos no cancelados por `fechaOperacion`, desde primer día hasta hoy en Bogotá; incluye ventas a crédito |
| Gastos del mes / compras del mes | suma de documentos registrados/recibidos por `fechaOperacion`; compras y gastos es su suma, no otra tabla |
| Ticket promedio del mes | ventas del mes divididas por cantidad de pedidos no cancelados; cero si no hay pedidos |
| Inventario inicial | conteo inicial + ajuste aplicado + snapshot de sus líneas y ledger; cantidad original y costo original |

### Consultas de lectura

En `psql`, cambiar el UUID de ejemplo por el del documento confirmado:

```sql
\set pedido_id 'UUID-DEL-PEDIDO'
SELECT p.id, p.numero, p.estado, p."fechaOperacion", p.total,
       SUM(l.subtotal) AS "totalLineas"
FROM pedidos p JOIN "pedidoLineas" l ON l."pedidoId" = p.id
WHERE p.id = :'pedido_id'
GROUP BY p.id;

SELECT "productoId", nombre, cantidad, "precioUnitario", "costoUnitario", subtotal
FROM "pedidoLineas" WHERE "pedidoId" = :'pedido_id' ORDER BY orden;

SELECT p.total,
       COALESCE(SUM(a."montoAplicado") FILTER (WHERE a."revertidoEn" IS NULL AND pago.estado = 'activo'), 0) AS pagado
FROM pedidos p LEFT JOIN "pagoAplicaciones" a ON a."pedidoId" = p.id
LEFT JOIN pagos pago ON pago.id = a."pagoId"
WHERE p.id = :'pedido_id' GROUP BY p.id;

SELECT id, "stockFisico", "stockReservado",
       "stockFisico" - "stockReservado" AS disponible
FROM productos WHERE "stockFisico" < "stockReservado" OR "stockReservado" < 0;
-- Esperado: ninguna fila.

SELECT "pedidoId", "productoId", COUNT(*) FROM "pedidoLineas"
GROUP BY "pedidoId", "productoId" HAVING COUNT(*) > 1;
-- Esperado: ninguna fila; la clave única también lo impide.

SELECT "conteoId", COUNT(*) FROM "ajustesInventario"
WHERE "conteoId" IS NOT NULL GROUP BY "conteoId" HAVING COUNT(*) > 1;
-- Esperado: ninguna fila.
```

Resumen mensual de lectura, con las mismas fechas que envía el frontend:

```sql
WITH calendario AS (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS hoy,
         date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date AS inicio
), ventas AS (
  SELECT COALESCE(SUM(p.total),0) AS total, COUNT(*) AS cantidad
  FROM pedidos p, calendario c
  WHERE p.estado <> 'cancelado' AND p."fechaOperacion" BETWEEN c.inicio AND c.hoy
), gastos_mes AS (
  SELECT COALESCE(SUM(g.monto),0) AS total FROM gastos g, calendario c
  WHERE g."fechaOperacion" BETWEEN c.inicio AND c.hoy
), compras_mes AS (
  SELECT COALESCE(SUM(r.total),0) AS total FROM "recepcionesCompra" r, calendario c
  WHERE r."fechaOperacion" BETWEEN c.inicio AND c.hoy
)
SELECT v.total AS ventas, g.total AS gastos, r.total AS compras,
       g.total + r.total AS "comprasYGastos",
       CASE WHEN v.cantidad = 0 THEN 0 ELSE ROUND(v.total / v.cantidad,2) END AS "ticketPromedio"
FROM ventas v, gastos_mes g, compras_mes r;
```

Comprobación del inventario inicial, sin recortar a 30:

```sql
WITH inicio AS (
  SELECT c.id FROM "conteosInventario" c
  JOIN "ajustesInventario" a ON a."conteoId" = c.id
  WHERE c.tipo = 'inicial' AND c.estado = 'confirmado'
), ledger AS (
  SELECT "productoId", SUM("deltaStockFisico") AS delta
  FROM "movimientosInventario" GROUP BY "productoId"
)
SELECT l."productoId", l."nombreInicial", l."stockFisico" AS inicial,
       l."costoUnitarioInicial", p."stockFisico" AS actual,
       l."stockFisico" + COALESCE(m.delta,0) - l."deltaAcumuladoInicial" AS esperado,
       p."stockFisico" - (l."stockFisico" + COALESCE(m.delta,0) - l."deltaAcumuladoInicial") AS diferencia
FROM "conteoLineas" l JOIN inicio i ON i.id = l."conteoId"
JOIN productos p ON p.id = l."productoId"
LEFT JOIN ledger m ON m."productoId" = l."productoId";
-- Esperado: diferencia cero en todas las líneas.
```

Los textos con placeholders son para sustituirlos localmente; no publicar tokens, cuentas reales ni resultados privados. En Windows los scripts de validación usan `docker.exe compose ... exec -T postgres psql` sobre **ambie_test**, nunca sobre el negocio por defecto.

## Confirmación inmediata y actualización visual

La respuesta correcta implica transacción confirmada, no trabajo pendiente de persistencia. El tiempo HTTP incluye validación, espera de bloqueos y commit; medir con `performance.now()` alrededor del POST. Una consulta posterior con Docker/psql agrega el tiempo de esos clientes y no mide el instante exacto del commit.

La otra pestaña recibe la modificación mediante revisión cada dos segundos más latencia; hay un refresco de respaldo. No es entrega instantánea garantizada. Redis almacena lecturas del tablero, no escrituras ni el único comprobante de una operación. Reiniciar Redis no debe perder pedidos. La interfaz no ofrece guardado de negocio sin conexión.

Pruebas reproducibles en QA:

```powershell
npm.cmd run verificar
npm.cmd run prueba:cache
npm.cmd run prueba:guardados
npm.cmd run prueba:inventario:inicial
npm.cmd run prueba:integracion
npm.cmd run prueba:persistencia
npm.cmd run prueba:paneles
node Backend/scripts/probar-guardado-ui.cjs
```

`prueba:guardados` comprueba conservación de clave, reenvíos secuenciales/simultáneos, otra intención, conflicto y rollback; consulta pedidos, pagos y stock directamente. `prueba:inventario:inicial` comprueba unicidad, conteo completo, stock que cambió, rechazo sin escritura parcial, cancelación antes de aplicar, costos conservados, compra repetida y paginación sin recortar totales. Si QA ya tiene un inicio aplicado, lo conserva y valida la comparación; no borra la base para repetir el recorrido.
