# Validar formularios y PostgreSQL

La revisión vigente de conteos y páginas está al final, en «Criterios de aceptación V5P3». Las mediciones y alturas de las secciones anteriores son históricas: la altura fija de 64 rem fue sustituida por contenedores ajustados al contenido, con desplazamiento interno y páginas de 5/15 registros.

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
  SELECT SUM(pa."montoAplicado") AS pagado FROM "pagoAplicaciones" pa
  JOIN pagos pago ON pago.id = pa."pagoId"
  WHERE pa."pedidoId" = p.id AND pa."revertidoEn" IS NULL AND pago.estado = 'activo'
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

El navegador recorrió Inicio, Ventas, Pedidos, Créditos, Inventario, Compras, Precios, Caja, Cierre, Usuarios, Auditoría y Configuración. Comprobó filtros, regreso, conservación de borradores y scroll durante sincronización, además de tamaños 390×844, 390×320 y 1440×320. Configuración conserva los accesos generales a Usuarios y Auditoría.

| Formulario real QA | Confirmación desde el clic | Observación directa en PostgreSQL |
|---|---|---|
| Cliente: nombre, teléfono, dirección y nacimiento | 252 ms | 592 ms; los cuatro campos coinciden |
| Venta ocasional: 2 Coca-Colas de $3.500 y 3 Doritos de $5.200 | 231 ms | 566 ms; total, pago aplicado y caja de $22.600 |

Son mediciones de una ejecución local, con tiempos redondeados; la observación SQL incluye lanzar psql mediante Docker. La factura continuó mostrando sus precios originales al cambiar el catálogo a $9.000 y recargarla. Ventas, número de pedidos y ticket del día también coincidieron entre API y PostgreSQL QA. El recorrido espera el regreso normal del formulario antes de empezar el siguiente ejercicio; no interrumpe una confirmación pendiente con otra navegación.

En la instalación del negocio se ejecutaron los cinco bloques de consulta de esta guía en transacciones de lectura. Las nueve ventas del mes suman $121.600 y su ticket promedio es $13.511,11; compras y gastos son cero. No se encontraron diferencias entre subtotales y cantidades por precio, entre totales y suma de líneas, ni entre stock reservado y reservas activas. La caja neta es $39.900: ventas y caja representan conceptos distintos y no deben igualarse sin revisar pagos y crédito. Se conservaron 8 clientes, 32 productos, 9 pedidos, 4 pagos y 4 movimientos de caja, sin escribir operaciones comerciales en producción.

Las cinco tarjetas mensuales se contrastaron en Chrome con la API y SQL. No hubo errores de ejecución; el Inicio móvil no desborda horizontalmente y el ingreso funciona con scroll a 320×320. La instalación local quedó con cinco servicios saludables, migración finalizada con código 0 y rutas `/`, `/salud` y `/api/v1/salud` con respuesta 200. Antes de actualizar se creó un respaldo PostgreSQL de 147.657 bytes y se leyó completamente con `pg_restore`; no se restauró sobre el negocio. Estas comprobaciones son locales, sin despliegue externo ni validación de DNS/HTTPS en otro servidor.

## Ejercicios adicionales para repetir en QA

### Nueva comprobación móvil: 9 de octubre, después de ampliar las listas

Se reutilizaron los componentes y guardados existentes. Los gráficos conservan el detalle al pasar el ratón en escritorio; en Chrome con pantalla táctil emulada, un toque lo muestra y otro lo oculta. Se comprobó la etiqueta visible en una captura, además del estado del botón. Las listas principales de Pedidos, Créditos, Inventario, Compras, Precios, Caja y Cierre tienen una altura estable de 64 rem y desplazamiento interno; el panel exterior permite llegar a la parte inferior. Pedidos necesitó ampliar la primera medida porque sus tarjetas de 172–190 px no dejaban caber cinco registros completos.

Agregar productos utiliza un contenedor de 33 rem con padding horizontal de 8 px y el botón de continuar debajo. Cinco tarjetas completas caben dentro del contenedor; la página se desplaza para acceder al pie. Se comprobaron selección y continuación como administrador y vendedor, manteniendo buscador, categorías y cantidades. Las pruebas de ambos roles usan el mismo flujo existente, sin ejecutar una venta de producción.

En la última ejecución QA, el cliente recibió respuesta confirmada en **136 ms** y se observó en PostgreSQL a los **397 ms**; la venta recibió respuesta en **209 ms** y se observó a los **493 ms**. La venta de dos líneas sumó **$22.600**, con cantidades 2 y 3, y coincidió con pago y caja. La factura conservó sus precios tras modificar el catálogo. Los agregados del día coincidieron con SQL: **56 pedidos y $264.800**, antes de la ejecución posterior de integración. Son registros exclusivamente QA y mediciones puntuales, no un límite de latencia garantizado.

Pasaron `verificar`, las dos pruebas de caché, el recorrido de paneles con hover/toque y los 18 casos de integración. El cierre ya existente en QA se conservó: ese caso comprobó el rechazo de duplicados, sin crear otro cierre. Se mantienen advertencias previas de estilo React; no hubo errores de compilación ni de ejecución del recorrido. El control final del repositorio no detectó patrones sensibles en 254 archivos revisados.

La actualización de producción conservó **8 clientes, 32 productos, 11 pedidos, 6 pagos y $206.500 en ventas no canceladas**, iguales antes y después. Estos valores sustituyen al inventario de datos histórico anterior: el negocio añadió operaciones entre ambas revisiones. Respaldo previo de PostgreSQL: **152.086 bytes**, con índice de 283 entradas leído mediante `pg_restore -l`; no se restauró ni se borró información del negocio.

Cloudflare sirve la misma compilación que localhost:8080. El acceso HTTPS anónimo devuelve 200 para aplicación y salud, y 401 para clientes sin sesión. El enlace de pruebas es temporal y se obtiene de los logs actuales; al reiniciarlo puede cambiar y debe actualizarse el origen permitido de la API. No se probó automáticamente el ingreso autenticado a través del enlace público: la revisión automática bloqueó enviar la contraseña de `system` a ese destino. La prueba física desde un celular sigue pendiente del usuario.

En producción local, Chrome completó el ingreso por localhost:8080 y comprobó la etiqueta táctil, la lista ampliada de pedidos y Configuración general sin errores de ejecución. Esa sesión solo leyó información comercial y no envió credenciales al destino público. El respaldo de esta revisión se conserva en `.local/backups/antes-ajustes-movil-20261010T003217778Z.dump`.

En la revisión posterior del mismo día, el túnel temporal perdió su registro con `Unauthorized: Tunnel not found`, mientras los cinco servicios del negocio permanecieron saludables. Se repitieron `verificar` y las comprobaciones locales de ingreso, gráfico táctil, lista y Configuración; aprobaron sin modificar operaciones comerciales. Se recreó únicamente Cloudflare y se actualizó el origen permitido de la API al nuevo enlace con cookies seguras. No fue necesario volver a desplegar el frontend. Reiniciar un proceso no recupera un registro temporal eliminado por el proveedor: por eso cambia el enlace. El acceso externo estable sigue pendiente de configurar un túnel con nombre y dominio fijo.

Para repetir desde el teléfono: abrir el enlace vigente, ingresar con la cuenta del negocio, tocar una barra y un punto de rentabilidad, revisar cinco productos, bajar hasta Continuar y volver sin confirmar una operación ficticia. Para una venta real autorizada, consultar su número con los SQL anteriores y comparar líneas, total, método, pago y caja. El equipo debe permanecer encendido y conectado. Ver [pendientes de instalación](OPORTUNIDADES_MEJORA.md) para distinguir acceso LAN de acceso HTTPS por túnel.

1. Registrar una venta en billetera y contrastar importe, método y movimiento de caja.
2. Crear un pedido a crédito, aplicar un abono parcial y comprobar saldo y distribución FIFO sin sumar dos veces el pago.
3. Cancelar un pedido abierto y comprobar liberación de reserva y reversos; un pedido entregado debe rechazar esa cancelación.
4. Recibir una compra con y sin descuento de caja, verificando físico, costo, total y la diferencia legítima de caja.
5. Hacer un conteo parcial y aplicar su ajuste: solo deben cambiar los productos digitados. No registrar un inventario inicial ficticio en el negocio.

Para validar producción, recargar la pestaña y consultar los datos existentes con los mismos filtros de la pantalla. No se necesita borrar información ni cargar el catálogo QA.

## Criterios de aceptación V5P3 — revisión del 9 de octubre

Esta revisión sustituye la altura fija de las listas: contenedores según contenido, máximo con scroll interno, paginación de cinco registros en móvil/tablet y quince en escritorio con puntero fino. Las líneas de un documento, los totales SQL y los abonos FIFO no se recortan por ese límite. La fecha UTC de los archivos de evidencia es 10/10/2026, correspondiente a la noche del 09/10 en Bogotá.

Evidencias locales, excluidas de Git porque contienen datos de prueba o del negocio:

- E1: `.local/pruebas-criterios/resultados.json`: ocho tamaños de catálogo, páginas 5/15, límites, filtros, 54 visitas a nueve módulos en seis anchuras; gestos, precio guardado una sola vez y carrito de dos páginas. Las pruebas de tamaños usan el catálogo de productos y los componentes comunes; no simulan 1.000 documentos de cada área comercial.
- E2: `.local/pruebas-persistencia/conteo-diario.json`: 17 productos, cuatro jornadas simuladas, 21 capturas, concurrencia, ciclo, cero, actor, fecha, general parcial y aplicación única. El historial previo se conserva. La ejecución anterior de 204 productos/41 jornadas simuladas queda en `conteo-diario-204-productos.json`; no representa días reales transcurridos.
- E3: `.local/pruebas-criterios/formulario-conteo.json`: formulario táctil real, cinco productos, cero guardado y conservado al recargar; responsable y fecha en SQL, stock y ledger sin cambios. Confirmación puntual de 99,6 ms. Se corrigió el orden inestable de líneas: apertura, actualización y lectura individual usan ahora el mismo orden por id, sin cambiar datos históricos.
- E4: `prueba:paneles` y `.local/pruebas-ui/conciliacion-formularios.json`: doce módulos, filtros, borradores, regreso, sincronización, venta/cliente reales QA y precios históricos. Cliente: respuesta confirmada 201,6 ms y observado en SQL a 477,2 ms. Venta: 186,4 ms y 452,8 ms; dos productos con cantidades 2/3, total/pago/caja de $22.600. La observación incluye arrancar Docker/psql; no mide el instante interno del commit.
- E5: 18 casos de `prueba:integracion`, dos de caché y pruebas de reintentos con cuatro pedidos confirmados: permisos, sesiones, concurrencia, reservas, cobros FIFO, reversos, adjuntos, compras, gastos, precios y agregados. El cierre ya existente solo valida rechazo de duplicados; no se creó un cierre nuevo en ese recorrido.
- E6: `.local/pruebas-persistencia/inventario-inicial.json`: inicio aplicado conservado, 146 productos, valor inicial $3.959.105, diferencias cero; compra repetida genera una recepción y mantiene cantidades/costos de partida. No se reemplazó el inicio existente para volver a probar su creación.
- E7: `.local/pruebas-criterios/detalles-final.json`: comprobante autenticado del pedido individual con respuesta 200 y contenido; tablet táctil de 1024 px con cinco registros y resumen SQL de jornada.
- E8: `.local/pruebas-ui/conservacion-antes.json`, `conservacion-despues.json`, `integridad-produccion.json` y `produccion-criterios.json`: huellas y cantidades de 23 tablas comerciales iguales antes/después, integridad SQL y navegador real en producción local; únicamente lecturas comerciales.
- E9: `.local/pruebas-criterios/consultas-documentadas.json`: los diez bloques SQL de esta guía y de guardado/conciliación se ejecutaron en QA con conexión de solo lectura.

| Criterio | Resultado | Comprobación |
|---|---|---|
| CA-01 | Aprobado | E3: botones diario/general en el formulario real. |
| CA-02 | Aprobado | E1/E2: catálogos 0/1/5/6; selección distinta de hasta cinco, cero productos rechaza iniciar. |
| CA-03 | Aprobado | E2: ninguna línea repite producto en su ciclo confirmado. |
| CA-04 | Aprobado | E2: cobertura 17/4 y 204/41 jornadas simuladas; selección común contrastada con ocho tamaños. |
| CA-05 | Aprobado | E2/E6: general incluye el catálogo activo y usa los documentos/ajustes existentes. |
| CA-06 | Aprobado | E2/E3: captura, historial, diferencias, actor y fecha; stock cambia solo al aplicar. |
| CA-07 | Aprobado | E1/E8: nueve listas administrativas con paginador. |
| CA-08 | Aprobado | E1/E7: móvil/tablet cinco, incluida tablet táctil de 1024 px. |
| CA-09 | Aprobado | E1/E8: escritorio quince por página, scroll interno y sin desborde horizontal. |
| CA-10 | Aprobado | E1: posición y centrado medidos; capturas revisadas sobre los encabezados de lista. |
| CA-11 | Aprobado | E1: controles y gestos táctiles horizontales reales de Chrome; vertical no cambia página. |
| CA-12 | Aprobado | E1/E7: consultas page/pageSize, límites SQL y detalle individual; no snapshot global de historial. |
| CA-13 | Aprobado | E1/E4/E6: búsqueda y filtros remotos antes de LIMIT; sumas globales fuera de la página. |
| CA-14 | Aprobado | E1: última página y petición fuera del límite se ajustan correctamente. |
| CA-15 | Aprobado | E1/E4/E5: creación/edición, invalidación y reintentos; páginas anteriores bloquean acciones al actualizar. |
| CA-16 | Aprobado | E1: listas vacías/un registro sin reservar altura para filas inexistentes. |
| CA-17 | Aprobado | E1: contenedores comunes en nueve módulos y seis anchuras. |
| CA-18 | Aprobado | E1: margen inferior medido de al menos 12 px. |
| CA-19 | Aprobado | E4: desplazamiento interno/exterior con poca altura y acceso al pie de productos. |
| CA-20 | Aprobado | E1: capturas de 1366/1920 revisadas; área interna aprovecha el alto disponible. |
| CA-21 | Aprobado | E1/E4: capturas, medidas de desborde, controles accesibles y pantallas de poca altura. |
| CA-22 | Aprobado | E3/E4/E5/E6: creación, consulta, edición, confirmaciones, cancelación/reversos y controles de acceso existentes. No se añadió borrado físico de documentos. |
| CA-23 | Aprobado | E4/E5: administrador/vendedor, permisos API y protecciones de system. |
| CA-24 | Aprobado | E2/E4/E6/E8: totales, saldos, stock, costos iniciales e historial preservados. |
| CA-25 | Aprobado | E1: 0, 1, 5, 6, 15, 16, 100 y 1.000; API paginada y frontend de catálogo. |
| CA-26 | Aprobado | E1/E4/E8: ningún error de ejecución durante los recorridos; fallos de lectura mantienen aviso y Reintentar. |
| CA-27 | Aprobado | E1: 360, 390, 768, 1024, 1366 y 1920 px. |
| CA-28 | Aprobado | E1–E7: módulos administrativos, ventas de ambos roles, inventarios, comprobantes y navegación. |
| CA-29 | Aprobado | E8: respaldo, migraciones con código 0, servicios saludables y huellas conservadas. |
| CA-30 | Parcial; pendiente de cierre | E8: ingreso en localhost:8080, nueve listas, jornada, Configuración, gráfico táctil y cinco tarjetas contra API/SQL; escrituras comerciales ejercitadas en QA con las mismas imágenes. Falta completar la validación móvil autenticada de producción solicitada; el nuevo origen público espera autorización. |
| CA-31 | Aprobado | E1–E9, compilación/tipos/lint y regresiones corregidas, con límites declarados. |

Producción conserva **8 clientes, 32 productos, 12 pedidos, 7 pagos y $263.000 en ventas no canceladas**. El mes tiene 12 pedidos y ticket API de $21.916,67; compras y gastos son cero. No se escribieron operaciones comerciales de prueba en el negocio. PostgreSQL pasó de 39 a 36 tablas: se retiraron solo `recordatoriosCredito`, `cierrePedidos` y `cierreMovimientos`, vacías y sin uso, con bloqueo y comprobación dentro de la migración. Se añadieron las relaciones y restricciones del conteo; no se reinició información. Cero diferencias en subtotales, total de documentos, reservas y unicidad de ajustes.

Respaldo previo `.local/backups/antes-conteos-paginacion-20261009T230243.dump`, **155.471 bytes**, leído completamente mediante `pg_restore --file=/dev/null`. Esto comprueba lectura del respaldo, no una restauración ensayada. Los cinco servicios del negocio arrancaron saludables; la migración/semilla terminó con código 0. La semilla conserva credenciales existentes y no carga operaciones demo.

Resultado: 30 criterios aprobados, ninguno fallido y CA-30 parcialmente verificado; no se considera cerrada la aceptación completa mientras falte esa comprobación de producción móvil. La renovación de Cloudflare creó un nuevo enlace: aplicación y salud responden 200 sin sesión, clientes responde 401. Habilitar el origen de sesión requiere la autorización específica solicitada por la revisión automática. Las escrituras de prueba usan QA; no se atribuyen a producción ni a un dispositivo físico. Además quedan pendientes de preparación operativa una restauración ensayada, dominio estable y capacidad medida de una instalación externa. Se mantienen advertencias de estilo React sin errores de compilación. Ninguna prueba concreta garantiza ausencia absoluta de fallos.

Para repetir los nuevos ejercicios en QA después de levantar sus servicios:

```powershell
node --env-file=.env Backend/scripts/probar-criterios.cjs
node --env-file=.env Backend/scripts/probar-conteo-diario.cjs
npm.cmd run prueba:inventario:inicial
```

Estos scripts conservan el historial QA y escriben solo contra 8180/ambie_test. El ensayo de cobertura usa fechas históricas simuladas únicamente en QA. Su tiempo p95 más reciente fue **148,9 ms** para 21 capturas, con 17 productos; no es una garantía de latencia en otro equipo.

### Corrección visual de paginadores — 10/10/2026

La ubicación solicitada ahora sustituye la de CA-10: debajo del buscador y de los filtros, antes de los registros. El encabezado y los pasos del pedido permanecen arriba. El control muestra solo flecha izquierda, indicador 1/7 y flecha derecha, sin marco ni fondo; mide 28 px de alto y conserva etiquetas accesibles y una zona táctil ampliada.

Se comprobaron en Chrome real 64 casos en anchuras de 360, 390, 768, 1024, 1366 y 1920 px: las diez listas principales, los botones de avance y retroceso, el selector de proveedores y el paso Agregar productos. Sin desbordamiento horizontal ni errores de ejecución. En pedidos, cinco tarjetas completas de 70,5 px caben dentro del contenedor; los productos siguen disponibles al abrir el detalle. Las pruebas fueron de lectura y navegación, sin registrar operaciones comerciales. Evidencias locales: .local/paginador-compacto/resultados.json y capturas del mismo directorio. Estas pruebas emulan tamaños móviles; no equivalen a una prueba física en un teléfono.

Publicación local comprobada en http://localhost:8080: frontend saludable, nueve módulos administrativos y etiquetas táctiles revisados sin errores de ejecución. Los cinco indicadores mensuales coinciden con PostgreSQL. Se compararon antes y después las huellas de 23 tablas comerciales: ningún registro cambió durante esta publicación. La comprobación general de contrato, API, tipos, compilación y revisión del frontend terminó sin errores; conserva advertencias de revisión existentes.

### Fallo de detalle después de consultar la factura — 10/10/2026

Se reprodujo la excepción de historialEstados.length al pasar de la factura al historial sin recargar. La factura almacenaba un Envelope {data}, mientras el lector de detalles almacenaba un documento directo bajo la misma clave de caché. El resultado dependía de cuál pantalla se abría primero. Se unificó la caché por sesión y ruta con la respuesta HTTP completa; los lectores extraen data mediante select. Tablero e inventario inicial siguen el mismo contrato. No se crean tablas ni se modifican pedidos para resolver este error.

Pedidos espera el documento individual antes de mostrar el detalle y ofrece Reintentar o Volver al historial si falla su lectura. La prueba de regresión Backend/scripts/probar-detalle-pedidos.cjs reproduce ambos sentidos del recorrido y una interrupción de lectura en 390 y 1440 px, exclusivamente en QA. Los 18 casos de integración aprobaron guardados, archivos, saldos, caja, reservas, concurrencia, cancelación, búsquedas y precios históricos; también aprobaron las pruebas de deduplicación, invalidación y separación de sesiones de caché.

Comprobación posterior en producción (10/10/2026): los 13 pedidos existentes abrieron su detalle sin errores. Se conciliaron 28 líneas y 15 entradas de historial, precios históricos, cantidades, totales, fechas y saldos con PostgreSQL; el total registrado es 298.500. La comparación antes/después de 23 tablas comerciales confirmó conservación íntegra. La distribución consultada fue 8 pedidos del 06/10, 4 del 09/10 y 1 del 10/10. Para consultar todos: HISTORIAL, Todo, Todos y sin filtros de texto/fecha; móvil muestra cinco registros por página. En estos 13 pedidos no hay comprobantes adjuntos registrados: la comprobación de archivo persistente se realizó en QA, no se inventaron imágenes de producción.

La revisión actual de paneles aprobó navegación, filtros, borradores, sincronización, vendedor móvil y formularios reales de cliente y pedido en QA. Confirmación de respuesta: cliente 172,4 ms; pedido 283,2 ms. Son mediciones de este recorrido local, no garantías de latencia ni el instante interno del commit. Evidencias privadas locales: .local/pruebas-ui/conciliacion-historial.json y conciliacion-formularios.json.

### Historial y consulta inicial de sesión

Pedidos abre por defecto HISTORIAL con Todo y Todos, sin fechas ni texto. HOY es un filtro opcional que muestra solo la fecha operativa de Bogotá. El contador distingue Historial completo, Historial filtrado y Solo hoy. Un pedido no se elimina al cambiar de día ni al paginar.

GET /auth/me puede responder 200 con data=null cuando no se presenta token de acceso: es la comprobación de sesión antes del ingreso. Si existe cookie de renovación indica renovable y el frontend intenta restaurarla. Un token inválido o revocado mantiene 401, y las rutas operativas siguen exigiendo sesión y rol. No se ocultan errores de autenticación ni se abren consultas comerciales anónimas.

### Validación actual de CSV e historial — 10/10/2026

En una base QA separada aprobaron los 18 casos de integración y los recorridos reales de pantallas, factura y detalle en 390 y 1440 px. La prueba probar-productos-csv.cjs confirmó carga desde el formulario, vista previa sin escrituras, exportación completa, separadores y comillas, renovación de sesión sin 401 inicial, permisos administrativos, reintentos y solicitudes simultáneas sin productos duplicados. Un lote con error revierte productos, precios y consecutivos. El inventario inicial se revisó y aplicó por el mecanismo existente; importar después con la opción inicial desmarcada conservó el stock histórico de los productos existentes.

La prueba probar-historial-fechas.cjs creó exclusivamente en QA pedidos de hoy, ayer, anteayer y siete días atrás, y comprobó su búsqueda y detalle en el historial. El filtro HOY excluyó correctamente los anteriores. Estas fechas de prueba no modifican registros del negocio.

En el recorrido actual de formularios QA la respuesta confirmada demoró 121,9 ms para el cliente y 199,9 ms para el pedido. La consulta posterior a PostgreSQL observó los datos a 400,2 y 491,3 ms respectivamente; incluye el costo de iniciar la consulta y no mide por separado el instante del commit. Cantidades 2 y 3, total 22.600, pago y factura coincidieron; cambiar precios después no alteró la factura. Son mediciones locales de esta ejecución, sin garantía de latencia en otros equipos o redes.

Publicación comprobada en localhost:8080 y por HTTPS en el túnel temporal autorizado: ingreso, recarga de sesión, historial completo y controles CSV disponibles, sin 401 ni errores de ejecución en esos recorridos. Se abrieron los 13 detalles originales y se conciliaron 28 líneas y 15 entradas de historial con PostgreSQL; total 298.500. Las huellas antes/después de 23 tablas comerciales coincidieron. La revisión SQL encontró cero diferencias en líneas, totales y reservas, y cero ajustes duplicados. Se creó un respaldo binario antes de publicar y no se borró ni reinicializó la base del negocio. El túnel es temporal y su dirección puede cambiar cuando se reinicia. La prueba de móvil usa Chrome con tamaño y entrada táctil emulados; falta la validación física del usuario desde su teléfono.

### Preparación de CSV de ejemplo y gráfico de descuadres — 10/10/2026

Esta ampliación se compiló y probó exclusivamente en QA (8180/3100), con imágenes separadas y una base nueva de pruebas. No se aplicó su migración ni sus imágenes a producción. El commit preparado para V5P3 incluye la marca sin despliegue para que publicar en GitHub ejecute verificaciones sin instalar estos cambios.

El archivo docs/ejemplos/catalogo-inicial.csv se cargó desde el formulario real de Precios. Se comprobaron las ocho columnas contra PostgreSQL y las cantidades/costos del conteo inicial. Los tres productos ficticios recibieron códigos automáticos distintos: 20 arepas a costo 2.100, 15 empanadas a 1.300 y 12 bebidas a 1.500; 47 unidades y valor inicial 79.500. Los nombres quedaron visibles en Precios. La misma suite aprobó repetición, concurrencia, permisos, rollback del lote, comillas/separadores, exportación y conservación de stock posterior al inicio.

probar-descuadres-tablero.cjs comprobó faltante 2 × 100 = 200, sobrante 3 × 250 = 750 y ajuste manual 1 × 999 = 999. Confirmar invalida la caché; aplicar un conteo no vuelve a sumar sus diferencias; cambiar costos después mantiene los importes anteriores. Se comprobó inclusión del conteo diario, exclusión de borradores/cancelados/inicial, aviso para costo histórico NULL y frontera UTC 04:59:59 / 05:00:00 del día de Bogotá. Los ocho recorridos (Día/Semana/Mes/Año en 390 y 1440 px) mostraron etiquetas con toque/hover sin errores; otra operación actualizó el gráfico automáticamente. La prueba conserva y reutiliza un conteo diario confirmado si se repite el mismo día.

El archivo SQL de consultas se ejecutó en una transacción READ ONLY contra QA: compras 130 y gastos 50 en el ejercicio de integración, líneas y caja conciliadas. No creó tablas de resumen ni modificó datos. Aprobaron los 18 casos de integración, las dos pruebas de caché y la regresión de paneles, historial de hoy/ayer/anteayer/siete días y factura → detalle en ambos tamaños. La compilación/tipos/lint pasó con advertencias de revisión preexistentes. Las evidencias privadas quedan en .local/pruebas-ui; los CSV/SQL compartibles quedan en docs/ejemplos. No acredita prueba física en celular ni instalación externa.
