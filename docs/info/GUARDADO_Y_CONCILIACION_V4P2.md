# Guardado y conciliación de datos — V4P2

PostgreSQL es la fuente de verdad de una instalación del negocio. La pantalla captura un borrador; el servidor valida permisos y reglas, calcula los importes y confirma las tablas relacionadas en una transacción. El navegador muestra la confirmación después de recibir esa respuesta. No hay una cola que guarde ventas más tarde.

El [diccionario completo](DICCIONARIO_DATOS_V4P2.md) explica las 38 tablas y sus 335 columnas físicas. El [modelo de datos](modelo-datos.md) relaciona las pantallas con esas tablas. El esquema y las migraciones de `Backend/prisma/` son las fuentes para comprobar tipos, claves y restricciones.

## Del formulario a la base

1. La persona captura o corrige los datos en la pantalla. El borrador no es una venta ni un movimiento de caja. La confirmación manual utiliza el guardado normal del formulario.
2. `Frontend/src/data/api.ts` envía la operación con cookie de sesión y `Idempotency-Key`. `guardados.ts` crea un UUID por intención de guardado. Si no se conoce el resultado por timeout, pérdida de conexión, respuesta ilegible o error 5xx, conserva esa clave para el siguiente envío de los mismos datos.
3. Solo se guardan la huella SHA-256 y el UUID pendientes en `sessionStorage`, nunca el formulario ni la respuesta. En un origen seguro (HTTPS o localhost), esa clave sobrevive a recargar la misma pestaña. Si el navegador bloquea ese almacenamiento o no ofrece Web Crypto en un origen HTTP inseguro, la protección del cliente permanece en RAM hasta cerrar/recargar. Login, logout y expiración limpian los intentos de la sesión anterior.
4. El guard de autenticación y los roles se comprueban antes del guardado y también antes de devolver una confirmación repetida. Renovar la sesión y volver a enviar no cambia la clave del intento.
5. `GuardadoInterceptor` abre una transacción PostgreSQL y toma un candado por usuario/clave. Dentro de esa misma transacción los servicios conservan sus bloqueos de productos, saldos y consecutivos. Sus bloques `$transaction` reutilizan la transacción activa; no confirman por separado. Fuera de una escritura protegida Prisma mantiene su comportamiento habitual.
6. Si la clave ya fue confirmada y la ruta/huella coinciden, devuelve el resultado original sin ejecutar otra vez el servicio ni la auditoría. Si los datos o la ruta son distintos, responde 409. El cuerpo capturado no se guarda en la tabla técnica: se conserva su huella y la confirmación de negocio, sin credenciales.
7. Si es un intento nuevo, se validan y guardan documento, líneas, dinero, reservas, stock, auditoría y `escriturasConfirmadas` según corresponda. El servidor responde **después del commit**. Un error revierte la operación y no consume la clave ni el consecutivo.
8. La pantalla invalida sus lecturas y espera la confirmación antes de cerrar. Si la lectura posterior falla, avisa que el documento ya fue guardado. Después de una confirmación conocida se retira la clave pendiente: otra venta legítima con los mismos productos recibe otra clave.

La protección cubre las escrituras de clientes, productos, pedidos y sus cobros, abonos, proveedores, recepciones, gastos, caja, inventario y cierres. Autenticación, usuarios y archivos conservan sus flujos actuales; no se almacenan sus respuestas ni credenciales en la tabla de confirmaciones. La carga de objetos en MinIO tiene un paso externo a PostgreSQL y no se presenta como una transacción distribuida.

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

### Conteo diario y general en V5P3

El diario selecciona hasta cinco productos activos, conserva el mismo documento durante el día de Bogotá y retoma uno anterior que siga abierto. Cada línea conserva el ciclo al que pertenece. Solo finalizar un conteo diario completo aporta cobertura al ciclo; cancelarlo no la aporta. El general reutiliza las mismas capturas, revisión y ajustes del inventario inicial, sin crear otra tabla de existencias. La compatibilidad API con conteos generales parciales se conserva: al aplicar, solo cambian las líneas digitadas.

El stock físico y la diferencia permanecen nulos hasta capturarlos. Digitar cero guarda cero, su diferencia, el usuario autenticado y el instante de captura. Finalizar guarda el historial; aplicar el ajuste es una confirmación posterior que modifica stock y ledger dentro de una transacción. La combinación de bloqueo de documento y unicidad de `ajustesInventario.conteoId` impide aplicar dos veces el mismo conteo. La restricción única del diario no incluye cancelados.

Para contrastar el detalle del frontend, sustituye únicamente el identificador:

```sql
BEGIN READ ONLY;
SELECT c.id, c.tipo, c.estado, c."fechaDiaria", c.turno,
       p.nombre, l."stockTeorico", l."stockFisico", l.diferencia,
       l."cicloDiario", l."contadoEn", u.nombre AS responsable,
       EXISTS (SELECT 1 FROM "ajustesInventario" a WHERE a."conteoId"=c.id) AS aplicado
FROM "conteosInventario" c
JOIN "conteoLineas" l ON l."conteoId"=c.id
JOIN productos p ON p.id=l."productoId"
LEFT JOIN usuarios u ON u.id=l."contadoPorId"
WHERE c.id='ID_DEL_CONTEO'
ORDER BY p.nombre, p.id;

-- Esperado: cero filas; una captura debe tener diferencia y responsable.
-- Los registros anteriores a esta migración pueden no tener contadoPorId.
SELECT l.id FROM "conteoLineas" l JOIN "conteosInventario" c ON c.id=l."conteoId"
WHERE c."fechaDiaria" IS NOT NULL AND l."stockFisico" IS NOT NULL
  AND (l.diferencia IS DISTINCT FROM l."stockFisico"-l."stockTeorico"
       OR l."contadoEn" IS NULL OR l."contadoPorId" IS NULL);

-- Esperado: cero filas; cada producto aparece una sola vez por ciclo confirmado.
SELECT l."cicloDiario", l."productoId", COUNT(*)
FROM "conteoLineas" l JOIN "conteosInventario" c ON c.id=l."conteoId"
WHERE c.estado='confirmado' AND l."cicloDiario" IS NOT NULL
GROUP BY l."cicloDiario", l."productoId" HAVING COUNT(*)>1;

-- Comparar el ajuste con el ledger, sin sumar stock por segunda vez.
SELECT a.id, a."conteoId", al."productoId", al."stockTeorico", al."stockFisico",
       al.diferencia, m."deltaStockFisico", m."stockFisicoAntes", m."stockFisicoDespues"
FROM "ajustesInventario" a JOIN "ajusteLineas" al ON al."ajusteInventarioId"=a.id
LEFT JOIN "movimientosInventario" m ON m."conteoId"=a."conteoId" AND m."productoId"=al."productoId"
WHERE a."conteoId"='ID_DEL_CONTEO';
COMMIT;
```

Los totales de cartera, caja y jornada se calculan en SQL antes de paginar. Los registros visibles usan `page` y `pageSize`: cinco en móvil/tablet y quince en escritorio con puntero fino. Cambiar página no recorta líneas de factura, un abono FIFO ni el total de un documento. Los productos del carrito permanecen en memoria al filtrar o paginar; el servidor vuelve a validar precio, disponibilidad y permisos al confirmar. La exportación completa consulta el conjunto filtrado solo al solicitarla.

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

## Catálogo CSV desde Precios

Precios ofrece Exportar CSV, Plantilla CSV e Importar CSV. La exportación incluye el catálogo completo, aunque la pantalla esté paginada o filtrada. Columnas: codigoInterno,nombre,categoria,unidad,precioVenta,costoActual,cantidadInicial,stockMinimo. Nombre y precioVenta son obligatorios; las demás columnas son opcionales. Máximo 200 filas y 2 MB por carga. Admite coma o punto y coma, texto entre comillas dobles, comillas escapadas y saltos dentro de celdas. Los números no llevan separador de miles; las cantidades son enteros no negativos.

Deja codigoInterno vacío para nuevos productos. Se busca primero por nombre normalizado (mayúsculas/espacios); si ya existe, se conserva su identidad. Si varios productos comparten nombre, exige el código. Un código desconocido se rechaza, nunca se inventa ni se reutiliza. Los productos nuevos reciben el consecutivo central PROD dentro de la transacción. Se rechazan filas repetidas y nombres que renombren un código sobre otro producto.

Al importar se muestra una revisión antes de Confirmar importación. La API valida el administrador, reutiliza ProductosService.crear y actualizarPrecio y las operaciones de InventarioService. El lote entero comparte la transacción existente y su clave de reintento: producto, precio, movimiento inicial, conteo, líneas y confirmación quedan juntos. Un error revierte el lote y los consecutivos. Importaciones simultáneas del mismo nombre comparten el bloqueo del catálogo inicial. No hay tablas nuevas para el CSV.

Con Preparar inventario inicial marcado, crea o completa el borrador inicial. cantidadInicial se guarda como cantidad contada, con responsable y fecha. El stock de productos anteriores cambia solo al revisar, confirmar y aplicar ese inventario con el mecanismo habitual. Las líneas no incluidas permanecen pendientes de conteo. El catálogo activo se incorpora al borrador sin borrar conteos existentes.

Si el inicio ya está confirmado, se rechaza la preparación inicial sin guardar ninguna fila; desmarca esa opción para actualizar catálogo/precios. En ese modo, se conservan las existencias de productos anteriores, aunque el CSV traiga otra cantidad; los nuevos se crean con su cantidad y el movimiento inicial existente. Las comparaciones del inicio conservan nombres/costos históricos y no incluyen automáticamente productos creados después de ese inicio. No uses un CSV de precios para reemplazar el stock diario: utiliza conteos, compras o ajustes.

Persistencia: productos y categorias identifican el catálogo; cambiosPrecio registra precio anterior/nuevo y usuario; movimientosInventario conserva la creación; conteosInventario y conteoLineas contienen la preparación inicial; ajustesInventario, ajusteLineas y el ledger registran su aplicación. No modifica facturas, pedidos ni precios de ventas ya guardadas. La invalidación y la revisión de sincronización existentes actualizan las otras pantallas tras el commit.

### Archivo de ejemplo y campos

El [CSV completo de ejemplo](../ejemplos/catalogo-inicial.csv) contiene tres productos ficticios identificados con el prefijo Ejemplo CSV. Se carga en QA desde Precios → Importar CSV → revisar → Confirmar importación. No cargarlo en un negocio real salvo que se desee registrar esos productos. Para comenzar un negocio, reemplaza sus nombres y valores por tu catálogo y conserva el encabezado.

| Campo | Qué escribir | Ejemplo | Cómo se guarda |
|---|---|---|---|
| codigoInterno | Vacío para un producto nuevo; código exportado para actualizar uno existente | vacío / PROD-0044 | productos.codigoInterno; el consecutivo nuevo lo asigna la API |
| nombre | Nombre completo; obligatorio | Ejemplo CSV Arepa de queso | productos.nombre; busca coincidencia ignorando mayúsculas y espacios repetidos |
| categoria | Categoría del producto | Preparados | categorias.nombre y productos.categoriaId |
| unidad | Unidad de venta | unidad / botella | productos.unidad |
| precioVenta | Precio unitario, sin símbolo de moneda ni miles; obligatorio | 4500 | productos.precioVenta; cambiosPrecio conserva modificaciones |
| costoActual | Costo unitario de compra/preparación | 2100 | productos.costoActual; no es el valor total del lote |
| cantidadInicial | Unidades físicas enteras y no negativas | 20 | stock de producto nuevo y cantidad contada del inventario inicial, si se prepara |
| stockMinimo | Umbral para avisar de pocas existencias | 5 | productos.stockMinimo |

En el ejemplo se esperan 47 unidades: arepa 20, empanada 15 y bebida 12; valor de inventario al costo 79.500 (42.000 + 19.500 + 18.000). El valor a precio de venta sería 165.000 y no debe confundirse con el costo. Se revisa y aplica el inventario inicial desde Inventario; importarlo no sustituye esa confirmación.

### Inventario, compras, gastos y descuadres

El [archivo de consultas de lectura](../ejemplos/validar-inventario-compras-gastos.sql) permite contrastar catálogo/stock, movimientos, conteos y responsable, costo guardado, compras y gastos. Se ejecuta contra la instalación elegida con parámetros desde y hasta, sin modificar datos:

```powershell
$usuarioBd = (docker.exe compose exec -T postgres printenv POSTGRES_USER).Trim()
$nombreBd = (docker.exe compose exec -T postgres printenv POSTGRES_DB).Trim()
Get-Content -Raw -Encoding UTF8 docs/ejemplos/validar-inventario-compras-gastos.sql |
  docker.exe compose exec -T postgres psql -U $usuarioBd -d $nombreBd -v desde=2026-10-01 -v hasta=2026-10-31
```

En QA agrega -p ambie-integracion y los archivos Compose de pruebas a todos los comandos Docker; el nombre de su base es ambie_test. Nunca restaures ni borres una base para consultar. En un cliente SQL reemplaza :'desde' y :'hasta' por fechas entre comillas y omite las instrucciones que empiezan con barra invertida, propias de psql.

Las tablas necesarias ya existen: productos/categorias como maestros; movimientosInventario como libro de cambios; conteosInventario/conteoLineas para conteos diarios y generales; ajustesInventario/ajusteLineas para su aplicación o correcciones manuales; proveedores/recepcionesCompra/recepcionLineas para compras; gastos y movimientosCaja para desembolsos. La migración de valoración agrega únicamente dos columnas de costo y los índices/triggers requeridos. No crea tablas de resumen ni otra copia del inventario.

Inicio → Descuadres de inventario permite agrupar por día, semana de lunes a domingo, mes y año. Muestra últimos 7 días, 8 semanas, 6 meses o 5 años, como los gráficos existentes. Usa el día de confirmación en America/Bogota, o el del ajuste manual; el período actual llega hasta su fin calendario. Faltantes = unidades negativas × costo guardado (importe positivo); sobrantes = unidades positivas × costo guardado; neto = sobrantes − faltantes. No compensa ambos para ocultar faltantes ni modifica automáticamente caja, gastos o utilidad.

Solo entran conteos confirmados no iniciales y ajustes manuales aplicados. Un conteo aplicado se cuenta una vez desde su documento, no otra desde el ajuste. Borradores, cancelados, líneas sin contar e inventario inicial quedan fuera. La misma fórmula aplica al conteo diario y al general. Si se confirma otro conteo sobre un descuadre aún no resuelto, es otra observación y se registra como tal: revisa/aplica el anterior antes de interpretar el acumulado como pérdida física única.

conteoLineas.costoUnitarioConteo captura el costo al guardar la cantidad; ajusteLineas.costoUnitario lo conserva al aplicar, y en un ajuste manual captura el costo de ese momento. Cambios de precio/costo posteriores no revalorizan registros anteriores. Los registros previos a esta migración permanecen con NULL: el tablero indica cuántas diferencias carecen de costo y no las valora con el catálogo de hoy. Costo cero explícito es un valor conocido de cero, distinto de NULL.

El stockTeorico de un conteo corresponde a su apertura. Si hay ventas/compras mientras se cuenta, la diferencia observada puede diferir del delta aplicado al stock; movimientosInventario conserva el antes/después real de la aplicación. El costo de descuadres representa diferencias observadas, no un egreso de caja ni una medición de pérdida contable certificada.

La caché del tablero usa formato v2 y revisión transaccional también para cabeceras/líneas de conteo y ajuste. Confirmar o aplicar invalida automáticamente; rollback no publica una revisión. La actualización entre pantallas conserva el mecanismo de sincronización existente.

## CSV y conteos compartidos — 10/10/2026

En Precios → Importar CSV, la opción «Preparar inventario inicial con las cantidades» comienza desmarcada. Para crear solo el catálogo, deja cantidadInicial vacía o en 0: los productos nuevos quedan con cero existencias y no se crea un conteo. Una cantidad positiva se carga al producto nuevo. En productos existentes siempre se conservan las existencias; para modificarlas usa compras o un conteo confirmado. El código vacío recibe un consecutivo automático; un nombre existente se reconoce y no se duplica.

Si marcas «Preparar inventario inicial», la celda vacía queda pendiente de conteo; 0 guarda un conteo de cero unidades; un entero positivo guarda esa cantidad. Revisa las líneas en Inventario → Conteo guiado y confirma el inicio. No se aplica automáticamente un ajuste al inventario existente.

Cada colaborador necesita su propia cuenta: Usuarios → Nuevo usuario → rol Inventario. Este rol entra en /inventario, ve los conteos abiertos y puede contar productos; no accede a ventas, clientes, caja, precios, usuarios ni ajustes. El administrador inicia el inventario inicial/general o el conteo diario. Al solicitar un inventario compartido del mismo tipo se continúa el abierto, sin crear otra copia.

«Tomar siguiente producto» asigna un pendiente por cinco minutos, usando el bloqueo transaccional del conteo. Otro colaborador no puede tomarlo ni guardar una cantidad en esa línea. «Renovar tiempo» prolonga la asignación propia; «Liberar producto» la devuelve a pendientes. Al vencer, otro usuario puede recuperarla; una pantalla vieja no puede guardar sin una asignación vigente. Se recomienda una cuenta distinta por persona, no compartir la misma sesión. Recargar y tomar un producto recupera la asignación propia vigente.

Guardar confirma la cantidad, fecha, responsable y costo en una sola transacción. Cero cuenta como completado. Una línea ya guardada no puede sobrescribirse desde el rol Inventario. participantesConteo conserva quienes guardaron al menos una cantidad, con primera y última participación; una corrección posterior no borra a un colaborador del historial. No duplica stock ni saldos. El progreso se agrega desde conteoLineas y la participación desde participantesConteo; el historial y sus líneas se consultan paginados (30).

El administrador ve progreso, unidades, valoración al costo, faltantes/sobrantes y fechas dentro de Conteo guiado. La pantalla exige completar todas las líneas antes de finalizar un conteo compartido. Los conteos parciales anteriores siguen admitidos por el mecanismo existente. Finalizar conserva el documento; «Aplicar ajuste al stock» requiere una segunda confirmación. Haz inventarios generales/iniciales durante una pausa de ventas y compras para evitar mezclar movimientos con cantidades observadas. La fecha de cada línea indica cuándo se detectó la diferencia; la fecha de cierre determina su período en Inicio. Estas valoraciones no equivalen a rentabilidad contable.

El conteo diario incluye cinco productos aleatorios (todos si hay menos). La rotación prioriza los no contados en el ciclo antes de repetir, y solo avanza al confirmar. Un conteo diario pendiente se retoma antes de abrir otro; varios celulares continúan el mismo conteo del día. No se ejecuta automáticamente sin confirmación del administrador.

Las pantallas se sincronizan con el mecanismo existente cada dos segundos más la latencia. Guardar espera la confirmación real de PostgreSQL, no una promesa de escritura instantánea ni la caché local.

El administrador puede usar Corregir sobre una línea contada mientras el documento siga abierto. La corrección envía contadoEnEsperado y se rechaza si la lectura cambió desde que se abrió; conserva a los participantes anteriores y no modifica el stock hasta aplicar el conteo.
