# Validar formularios y PostgreSQL

La revisión vigente es V8P4. Las mediciones y alturas de secciones anteriores son históricas: las listas paginadas usan cinco registros en móvil y quince en escritorio, sin desplazamiento interno; se desplazan con la pantalla. Los formularios conservan su desplazamiento cuando hace falta.

## V8P4 · Espacios móviles, barras y salida de conteos (11/10/2026)

- Márgenes exteriores móviles de ocho píxeles, tarjetas y buscadores compactos, sin reducir las áreas táctiles ni los campos por debajo del tamaño necesario para evitar el zoom del teclado. El escritorio mantiene su disposición. El contenido respeta los márgenes seguros del dispositivo.
- Cámara: solicita hasta Full HD cuando está disponible, enfoque continuo si la cámara lo admite y lectura nativa de formatos compatibles, con ZXing como respaldo. Alterna orientación y banda central sin abrir flujos adicionales. La vista muestra la imagen completa; selector de cámara, luz y zoom aparecen solo según las capacidades. Recuerda la elección durante la sesión y vuelve a la cámara trasera si la elegida dejó de existir. No almacena imágenes de la cámara. Referencias: [lector nativo y formatos admitidos](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) y [ajustes de cámara](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints).
- Robot: un toque inicia o silencia el micrófono. Silenciar deshabilita las pistas y envía silencio: conserva la conexión para terminar una transcripción pendiente, el razonamiento y la respuesta. Reactivarlo reutiliza la sesión e interrumpe la voz para dictar una corrección sin repetir el saludo. Las instrucciones recibidas mientras se interpreta se procesan en orden con el borrador previo. Dos toques rápidos apagan el agente, liberan micrófono/conexión y descartan su cola pendiente; ninguna operación se guarda automáticamente. Cerrar la nube o cambiar su ancho no cambia el audio. Los límites de sesión del servidor siguen vigentes.
- X junto al título de inventario inicial, general o diario: pide confirmar **Continuar después**, libera solo la asignación propia y conserva las cantidades ya guardadas. No guarda una cantidad que aún esté digitándose. El conteo sigue abierto para los demás colaboradores y se puede retomar. El administrador dispone de otra X, **Cancelar conteo definitivamente**, con confirmación: cancela para todos, libera asignaciones y conserva historial y stock. Los otros roles no reciben ese permiso.

Ejercicios desde el celular:

1. Recarga la aplicación. En Inventario → Stock general compara el ancho del buscador y las cinco tarjetas con el ancho de pantalla; desplaza la pantalla y pasa a otra página.
2. En una venta ocasional, escanea una etiqueta EAN: incluye todas las barras y margen blanco a ambos lados dentro del marco, evita reflejos y aleja ligeramente el teléfono para enfocar. Debe sonar un bip, volver al producto y sumar una unidad. Repite con QR. Si el teléfono tiene varias cámaras, elige la trasera principal; usa luz/zoom solo si sus controles aparecen.
3. En + Producto escanea un código nuevo, escribe un nombre existente y vincúlalo desde las coincidencias: ambos códigos deben identificar el mismo SKU y su stock debe mantenerse. En Productos modifica una presentación y comprueba sus identificadores con las consultas ya documentadas.
4. Activa el robot, dicta, toca para silenciar y espera la respuesta. Reactiva y dicta una corrección. Cierra la nube tocando fuera: el audio sigue activo. Dos toques rápidos deben apagarlo.
5. Cuenta y guarda una cantidad, toma otro producto y pulsa la X junto al título. **Volver** conserva el borrador; **Continuar después** conserva solo lo guardado. Reabre el mismo conteo desde otro celular y comprueba cantidad, responsable y fecha. La X definitiva del administrador debe conservar esos datos en el historial sin mover el stock.

Pruebas de esta revisión: `node Backend/scripts/probar-escaner-ui.cjs` aprobó dieciséis grupos sobre Chrome y API/PostgreSQL QA, incluyendo EAN-13 pequeño, girado 90/180°, contraste reducido y desenfoque leve; QR; alias; guardado de cero y trece; salida/reanudación; cancelación sin cambio de stock; controles de voz y corrección pendiente. También comprobó recepción de una transcripción después de silenciar, pistas deshabilitadas, reanudación sin nueva conexión y liberación al apagar. El selector/enfoque/luz, cámara recordada/retirada y la falla del detector nativo se verificaron con capacidades simuladas y decodificación real de ZXing. En la primera ejecución, barras sintéticas entre 78 y 586 ms en cuatro ejercicios; primera apertura con QR: 1399 ms. No son tiempos garantizados para cámaras físicas.

`node Backend/scripts/probar-presentaciones.cjs` aprobó siete grupos, incluyendo persistencia e historia de presentaciones, códigos y duplicados concurrentes; revisó doce módulos en diez anchos: 320, 360, 393, 412, 480, 600, 768, 1024, 1440 y 1920 px. Sin desbordamiento horizontal ni desplazamiento interno de listas; margen móvil máximo diez píxeles. Caché aprobada y 33 casos controlados del agente aprobados. La cámara física del Redmi 14C requiere el ejercicio del usuario; la emulación no certifica el enfoque de ese equipo.

Regresión del negocio: dieciocho casos de integración aprobados, más el recorrido de paneles en Chrome QA: etiquetas táctiles, cinco productos/continuación, roles, cliente y venta persistidos, factura con valores de venta históricos y totales conciliados contra PostgreSQL. Todas las escrituras de ejercicios permanecen en QA aislada; no se inició el servidor de desarrollo.

Publicación comprobada el 11/10/2026: producción local y el enlace HTTPS vigente sirven V8P4, con el asistente habilitado. Se conservaron los IDs de los 20 pedidos, 35 productos, 8 clientes, 15 pagos, 6 conteos y 2 usuarios previos; conciliación de stock, reservas y totales: cero diferencias. El respaldo previo se leyó completo sin restaurarlo. Revisión visual de producción a 393 px: margen de 8 px, cinco productos, sin desbordamiento horizontal y lista sin scroll interno; formulario con cámara/nombre/presentación y diálogo de salida del inventario inicial existente comprobados sin guardar ni cancelar operaciones. QA se retira sin borrar volúmenes. La prueba física de cámara/micrófono del celular sigue correspondiendo al usuario.

Para comparar salida y cancelación, consulta antes y después el mismo ID. Salir mantiene `en-curso` y las líneas contadas; solo la asignación propia debe desaparecer. Cancelar definitivamente mantiene las líneas contadas, deja `cancelado` y cero asignaciones. Ninguna acción crea un movimiento de stock:

```sql
SELECT c.id,c.tipo,c.estado,c."finalizadoEn",
       COUNT(l.id) FILTER (WHERE l."stockFisico" IS NOT NULL) AS contadas,
       COUNT(l.id) FILTER (WHERE l."asignadoPorId" IS NOT NULL) AS asignadas,
       (SELECT COUNT(*) FROM "participantesConteo" p WHERE p."conteoId"=c.id) AS participantes
FROM "conteosInventario" c LEFT JOIN "conteoLineas" l ON l."conteoId"=c.id
WHERE c.id='ID_DEL_CONTEO' GROUP BY c.id;
SELECT "productoId","stockFisico","contadoPorId","contadoEn","asignadoPorId","asignadoHasta"
FROM "conteoLineas" WHERE "conteoId"='ID_DEL_CONTEO';
```

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

## Pedido, cantidades y valores de venta históricos

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

Los 18 casos de integración QA aprobaron permisos, sesiones, transacciones, reserva de stock, concurrencia, pagos FIFO, cancelación, compras, gastos, cierre y valores de venta históricos. Los reintentos secuenciales y simultáneos conservaron un solo pedido y cobro por clave; los rechazos y rollback no dejaron documentos parciales. Aprobaron también dos pruebas de caché, dos de claves de guardado y seis de renovación de sesión.

El navegador recorrió Inicio, Ventas, Pedidos, Créditos, Inventario, Compras, Productos, Caja, Cierre, Usuarios, Auditoría y Configuración. Comprobó filtros, regreso, conservación de borradores y scroll durante sincronización, además de tamaños 390×844, 390×320 y 1440×320. Configuración conserva los accesos generales a Usuarios y Auditoría.

| Formulario real QA | Confirmación desde el clic | Observación directa en PostgreSQL |
|---|---|---|
| Cliente: nombre, teléfono, dirección y nacimiento | 252 ms | 592 ms; los cuatro campos coinciden |
| Venta ocasional: 2 Coca-Colas de $3.500 y 3 Doritos de $5.200 | 231 ms | 566 ms; total, pago aplicado y caja de $22.600 |

Son mediciones de una ejecución local, con tiempos redondeados; la observación SQL incluye lanzar psql mediante Docker. La factura continuó mostrando sus valores de venta originales al cambiar el catálogo a $9.000 y recargarla. Ventas, número de pedidos y ticket del día también coincidieron entre API y PostgreSQL QA. El recorrido espera el regreso normal del formulario antes de empezar el siguiente ejercicio; no interrumpe una confirmación pendiente con otra navegación.

En la instalación del negocio se ejecutaron los cinco bloques de consulta de esta guía en transacciones de lectura. Las nueve ventas del mes suman $121.600 y su ticket promedio es $13.511,11; compras y gastos son cero. No se encontraron diferencias entre subtotales y cantidades por precio, entre totales y suma de líneas, ni entre stock reservado y reservas activas. La caja neta es $39.900: ventas y caja representan conceptos distintos y no deben igualarse sin revisar pagos y crédito. Se conservaron 8 clientes, 32 productos, 9 pedidos, 4 pagos y 4 movimientos de caja, sin escribir operaciones comerciales en producción.

Las cinco tarjetas mensuales se contrastaron en Chrome con la API y SQL. No hubo errores de ejecución; el Inicio móvil no desborda horizontalmente y el ingreso funciona con scroll a 320×320. La instalación local quedó con cinco servicios saludables, migración finalizada con código 0 y rutas `/`, `/salud` y `/api/v1/salud` con respuesta 200. Antes de actualizar se creó un respaldo PostgreSQL de 147.657 bytes y se leyó completamente con `pg_restore`; no se restauró sobre el negocio. Estas comprobaciones son locales, sin despliegue externo ni validación de DNS/HTTPS en otro servidor.

## Ejercicios adicionales para repetir en QA

### Nueva comprobación móvil: 9 de octubre, después de ampliar las listas

Se reutilizaron los componentes y guardados existentes. Los gráficos conservan el detalle al pasar el ratón en escritorio; en Chrome con pantalla táctil emulada, un toque lo muestra y otro lo oculta. Se comprobó la etiqueta visible en una captura, además del estado del botón. Las listas principales de Pedidos, Créditos, Inventario, Compras, Productos, Caja y Cierre tienen una altura estable de 64 rem y desplazamiento interno; el panel exterior permite llegar a la parte inferior. Pedidos necesitó ampliar la primera medida porque sus tarjetas de 172–190 px no dejaban caber cinco registros completos.

Agregar productos utiliza un contenedor de 33 rem con padding horizontal de 8 px y el botón de continuar debajo. Cinco tarjetas completas caben dentro del contenedor; la página se desplaza para acceder al pie. Se comprobaron selección y continuación como administrador y vendedor, manteniendo buscador, categorías y cantidades. Las pruebas de ambos roles usan el mismo flujo existente, sin ejecutar una venta de producción.

En la última ejecución QA, el cliente recibió respuesta confirmada en **136 ms** y se observó en PostgreSQL a los **397 ms**; la venta recibió respuesta en **209 ms** y se observó a los **493 ms**. La venta de dos líneas sumó **$22.600**, con cantidades 2 y 3, y coincidió con pago y caja. La factura conservó sus valores de venta tras modificar el catálogo. Los agregados del día coincidieron con SQL: **56 pedidos y $264.800**, antes de la ejecución posterior de integración. Son registros exclusivamente QA y mediciones puntuales, no un límite de latencia garantizado.

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
- E4: `prueba:paneles` y `.local/pruebas-ui/conciliacion-formularios.json`: doce módulos, filtros, borradores, regreso, sincronización, venta/cliente reales QA y valores de venta históricos. Cliente: respuesta confirmada 201,6 ms y observado en SQL a 477,2 ms. Venta: 186,4 ms y 452,8 ms; dos productos con cantidades 2/3, total/pago/caja de $22.600. La observación incluye arrancar Docker/psql; no mide el instante interno del commit.
- E5: 18 casos de `prueba:integracion`, dos de caché y pruebas de reintentos con cuatro pedidos confirmados: permisos, sesiones, concurrencia, reservas, cobros FIFO, reversos, adjuntos, compras, gastos, valores de venta y agregados. El cierre ya existente solo valida rechazo de duplicados; no se creó un cierre nuevo en ese recorrido.
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

Pedidos espera el documento individual antes de mostrar el detalle y ofrece Reintentar o Volver al historial si falla su lectura. La prueba de regresión Backend/scripts/probar-detalle-pedidos.cjs reproduce ambos sentidos del recorrido y una interrupción de lectura en 390 y 1440 px, exclusivamente en QA. Los 18 casos de integración aprobaron guardados, archivos, saldos, caja, reservas, concurrencia, cancelación, búsquedas y valores de venta históricos; también aprobaron las pruebas de deduplicación, invalidación y separación de sesiones de caché.

Comprobación posterior en producción (10/10/2026): los 13 pedidos existentes abrieron su detalle sin errores. Se conciliaron 28 líneas y 15 entradas de historial, valores de venta históricos, cantidades, totales, fechas y saldos con PostgreSQL; el total registrado es 298.500. La comparación antes/después de 23 tablas comerciales confirmó conservación íntegra. La distribución consultada fue 8 pedidos del 06/10, 4 del 09/10 y 1 del 10/10. Para consultar todos: HISTORIAL, Todo, Todos y sin filtros de texto/fecha; móvil muestra cinco registros por página. En estos 13 pedidos no hay comprobantes adjuntos registrados: la comprobación de archivo persistente se realizó en QA, no se inventaron imágenes de producción.

La revisión actual de paneles aprobó navegación, filtros, borradores, sincronización, vendedor móvil y formularios reales de cliente y pedido en QA. Confirmación de respuesta: cliente 172,4 ms; pedido 283,2 ms. Son mediciones de este recorrido local, no garantías de latencia ni el instante interno del commit. Evidencias privadas locales: .local/pruebas-ui/conciliacion-historial.json y conciliacion-formularios.json.

### Historial y consulta inicial de sesión

Pedidos abre por defecto HISTORIAL con Todo y Todos, sin fechas ni texto. HOY es un filtro opcional que muestra solo la fecha operativa de Bogotá. El contador distingue Historial completo, Historial filtrado y Solo hoy. Un pedido no se elimina al cambiar de día ni al paginar.

GET /auth/me puede responder 200 con data=null cuando no se presenta token de acceso: es la comprobación de sesión antes del ingreso. Si existe cookie de renovación indica renovable y el frontend intenta restaurarla. Un token inválido o revocado mantiene 401, y las rutas operativas siguen exigiendo sesión y rol. No se ocultan errores de autenticación ni se abren consultas comerciales anónimas.

### Validación actual de CSV e historial — 10/10/2026

En una base QA separada aprobaron los 18 casos de integración y los recorridos reales de pantallas, factura y detalle en 390 y 1440 px. La prueba probar-productos-csv.cjs confirmó carga desde el formulario, vista previa sin escrituras, exportación completa, separadores y comillas, renovación de sesión sin 401 inicial, permisos administrativos, reintentos y solicitudes simultáneas sin productos duplicados. Un lote con error revierte productos, valores de venta y consecutivos. El inventario inicial se revisó y aplicó por el mecanismo existente; importar después con la opción inicial desmarcada conservó el stock histórico de los productos existentes.

La prueba probar-historial-fechas.cjs creó exclusivamente en QA pedidos de hoy, ayer, anteayer y siete días atrás, y comprobó su búsqueda y detalle en el historial. El filtro HOY excluyó correctamente los anteriores. Estas fechas de prueba no modifican registros del negocio.

En el recorrido actual de formularios QA la respuesta confirmada demoró 121,9 ms para el cliente y 199,9 ms para el pedido. La consulta posterior a PostgreSQL observó los datos a 400,2 y 491,3 ms respectivamente; incluye el costo de iniciar la consulta y no mide por separado el instante del commit. Cantidades 2 y 3, total 22.600, pago y factura coincidieron; cambiar valores de venta después no alteró la factura. Son mediciones locales de esta ejecución, sin garantía de latencia en otros equipos o redes.

Publicación comprobada en localhost:8080 y por HTTPS en el túnel temporal autorizado: ingreso, recarga de sesión, historial completo y controles CSV disponibles, sin 401 ni errores de ejecución en esos recorridos. Se abrieron los 13 detalles originales y se conciliaron 28 líneas y 15 entradas de historial con PostgreSQL; total 298.500. Las huellas antes/después de 23 tablas comerciales coincidieron. La revisión SQL encontró cero diferencias en líneas, totales y reservas, y cero ajustes duplicados. Se creó un respaldo binario antes de publicar y no se borró ni reinicializó la base del negocio. El túnel es temporal y su dirección puede cambiar cuando se reinicia. La prueba de móvil usa Chrome con tamaño y entrada táctil emulados; falta la validación física del usuario desde su teléfono.

### Preparación de CSV de ejemplo y gráfico de descuadres — 10/10/2026

Esta ampliación se compiló y probó exclusivamente en QA (8180/3100), con imágenes separadas y una base nueva de pruebas. No se aplicó su migración ni sus imágenes a producción. El commit preparado para V5P3 incluye la marca sin despliegue para que publicar en GitHub ejecute verificaciones sin instalar estos cambios.

El archivo docs/ejemplos/catalogo-inicial.csv se cargó desde el formulario real de Productos. Se comprobaron las ocho columnas contra PostgreSQL y las cantidades/costos del conteo inicial. Los tres productos ficticios recibieron códigos automáticos distintos: 20 arepas a costo 2.100, 15 empanadas a 1.300 y 12 bebidas a 1.500; 47 unidades y valor inicial 79.500. Los nombres quedaron visibles en Productos. La misma suite aprobó repetición, concurrencia, permisos, rollback del lote, comillas/separadores, exportación y conservación de stock posterior al inicio.

probar-descuadres-tablero.cjs comprobó faltante 2 × 100 = 200, sobrante 3 × 250 = 750 y ajuste manual 1 × 999 = 999. Confirmar invalida la caché; aplicar un conteo no vuelve a sumar sus diferencias; cambiar costos después mantiene los importes anteriores. Se comprobó inclusión del conteo diario, exclusión de borradores/cancelados/inicial, aviso para costo histórico NULL y frontera UTC 04:59:59 / 05:00:00 del día de Bogotá. Los ocho recorridos (Día/Semana/Mes/Año en 390 y 1440 px) mostraron etiquetas con toque/hover sin errores; otra operación actualizó el gráfico automáticamente. La prueba conserva y reutiliza un conteo diario confirmado si se repite el mismo día.

El archivo SQL de consultas se ejecutó en una transacción READ ONLY contra QA: compras 130 y gastos 50 en el ejercicio de integración, líneas y caja conciliadas. No creó tablas de resumen ni modificó datos. Aprobaron los 18 casos de integración, las dos pruebas de caché y la regresión de paneles, historial de hoy/ayer/anteayer/siete días y factura → detalle en ambos tamaños. La compilación/tipos/lint pasó con advertencias de revisión preexistentes. Las evidencias privadas quedan en .local/pruebas-ui; los CSV/SQL compartibles quedan en docs/ejemplos. No acredita prueba física en celular ni instalación externa.

## Colaboradores y cantidades opcionales — 10/10/2026

La prueba CSV usa el formulario real: dos productos nuevos con cantidadInicial vacía y 0, catálogo sin conteo inicial, lectura SQL de stockFisico=0. Con la opción inicial marcada, vacío queda NULL y 0 queda contado. El ejemplo de cantidades positivas conserva todos sus campos, 47 unidades y valor inicial 79.500. Se comprueban reintentos, lote atómico y conservación del stock de productos existentes.

probar-conteo-compartido.cjs prueba tres cuentas de Inventario con sesiones separadas: solicitudes paralelas reciben productos distintos; otro colaborador y el administrador no sobrescriben una asignación activa; guardar persiste cantidades/usuario/fecha/costo; una cantidad cero sobrevive a recarga. Una asignación vencida rechaza el guardado y se puede recuperar; liberar devuelve el producto a disponibles. Comprueba rol restringido, progreso contra SQL, listado mayor de 30 registros, historial con cuatro participantes al finalizar (tres colaboradores y administrador), cierre y vistas Chrome 390×844/1440. Los usuarios de pruebas son ficticios y existen solo en QA.

La rotación se comprobó con 13 productos activos de QA en tres jornadas simuladas: cinco distintos por jornada, cobertura de todos y un solo conteo diario ante solicitudes simultáneas. 16 guardados dieron p95 de 123,6 ms en esta ejecución; no es una garantía de latencia para redes móviles ni para otro servidor. El script restaura los productos activos al terminar. Las fechas simuladas no son operaciones comerciales reales.

Los 18 casos integrales y las dos pruebas de caché aprobaron. El gráfico de diferencias se contrastó con SQL: faltante 200, sobrante 750 y ajuste manual 999; cambios posteriores de costo no modificaron la valoración previa y aplicar el conteo no duplicó el importe. Se verificó día/semana/mes/año, toque en móvil y hover en escritorio. Son sesiones de navegador con tamaño móvil, no teléfonos físicos. La compilación, los 14 enums y la revisión de archivos privados aprobaron; quedan advertencias de lint anteriores en otros flujos.

Se comprobó también la actualización del progreso del administrador tras guardar desde otra sesión, sin recargar. La corrección administrativa desde el formulario conserva colaboradores y rechaza repetir una modificación usando la fecha de lectura anterior.

Producción local activada el 10/10/2026: respaldo binario previo, cinco servicios saludables y migraciones sin borrado. Las huellas de las 23 tablas comerciales coinciden antes/después: 14 pedidos, 32 productos, 8 clientes y 9 pagos. Conciliación sin errores en líneas, totales y reservas ni ajustes duplicados. El acceso local y el túnel temporal HTTPS se comprobaron con inicio de sesión real, historial de fechas anteriores, CSV, conteos compartidos, opción de rol Inventario y gráfico de descuadres; sin errores de consola ni respuestas 401 durante estos recorridos. Las cinco tarjetas mensuales coinciden con PostgreSQL (ventas 330.600 y 14 pedidos en esa instantánea). No se cargaron registros comerciales de prueba en producción.


## Ejercicios V7P4 · robot y lectura de códigos

Se trabaja en V7P4; V6P4 quedó publicada antes de los ajustes. La instalación del negocio de 8080 no se migra ni reinicia con estas pruebas. El desarrollo se consulta en http://127.0.0.1:8180. El lector es ZXing Browser, cargado solo al abrir la cámara; documentación: https://github.com/zxing-js/browser. Para cámara/micrófono en un celular se necesita HTTPS y autorización del dispositivo; HTTP por IP de la red permite consultar la aplicación, pero no garantiza acceso a cámara.

1. En Productos, crear un producto con nombre, unidad, costo, precio y mínimo. Escanear una etiqueta nueva, buscar el nombre y seleccionar la coincidencia: al guardar debe conservar el mismo PROD y sus existencias. En la sección de códigos se puede retirar una etiqueta tras confirmar, conservando las otras.
2. En una instalación vacía, abrir Inventario → Conteo guiado → Inventario inicial. Escanear un código nuevo, crear nombre/unidad (sin costo/precio), guardar el producto y contar 0 o cualquier cantidad entera. Otro colaborador no puede repetirlo. Cerrar/aplicar requiere administrador y revisar todas las líneas. Parametrizar el precio después conserva la cantidad inicial.
3. En Ventas, paso Agregar productos, tocar la cámara del buscador. Leer QR y barras: bip, regreso, nombre en el filtro y una unidad seleccionada. Escanear la misma etiqueta otra vez suma una unidad. No se confirma la venta por escanear.
4. En general, entrar desde dos usuarios Inventario: escanear el mismo producto simultáneamente. Solo uno recibe la asignación; el otro ve el aviso. Guardar 0 → cámara → siguiente etiqueta → guardar 13. Recargar y revisar cantidades, responsable, fechas y diferencias desde administrador.
5. Entrar como vendedor: Conteo diario → Abrir conteo de hoy. Solo aparecen los cinco seleccionados (o todo el catálogo si hay menos de cinco). Leer una etiqueta ajena al diario debe mostrar un aviso sin cambiar cantidades. El rol Inventario no puede abrir diarios; vendedor no puede abrir generales ni consultar historial cerrado.
6. Robot: tocar una vez inicia audio; tocar fuera oculta solo su burbuja; tocar otra vez detiene. El deslizador cambia el ancho, limitado a la pantalla, y la transcripción conserva dos líneas. Arrastrar mueve el robot sin activar/desactivar el micrófono. Confirmar operaciones sigue usando voz o el formulario del negocio.
7. CSV: `codigosLectura` es opcional; `7701234567890|7701234567891` vincula ambas etiquetas. No usar fórmulas ni separadores de miles. `cantidadInicial` vacía significa sin contar; 0 significa cero unidades. Los archivos anteriores siguen funcionando sin añadir esta columna.

Pruebas reproducibles desde la raíz, con PostgreSQL QA 5433 y API/frontend QA disponibles:

```powershell
npm.cmd run verificar
node Backend/scripts/probar-codigos-inventario.cjs
node Backend/scripts/probar-conteo-compartido.cjs
node Backend/scripts/probar-escaner-ui.cjs
```

La prueba de códigos crea una base nueva `ambie_v7_pruebas_<fecha>` dentro de PostgreSQL QA y una API temporal 3110, que detiene al terminar; conserva los resultados y la base. La prueba de interfaz usa Chrome real con cámara sintética: decodifica imágenes QR/EAN-13 mediante el lector real y guarda conteos en QA. El robot utiliza transporte de audio simulado para comprobar sus controles, sin afirmar reconocimiento acústico real. No equivale a probar cámaras, altavoces, conexión HTTPS ni proveedor de voz en celulares físicos. Informes y capturas quedan en `.local/pruebas-v7/`.

### Consultas de lectura

Usar la conexión del inicio de esta guía; reemplazar PROD y conteo por los que muestra la pantalla. Estas consultas no modifican datos.

```sql
-- Un producto interno, varias etiquetas. Los retirados permanecen relacionados.
SELECT p.id, p."codigoInterno", p.nombre, p.unidad, p."precioPendiente",
       c.codigo, c."creadoEn", c."retiradoEn"
FROM productos p LEFT JOIN "codigosProducto" c ON c."productoId"=p.id
WHERE p."codigoInterno"='PROD-0001'
ORDER BY c."creadoEn";

-- Relación única garantizada también por el índice UNIQUE.
SELECT codigo, COUNT(*) FROM "codigosProducto" GROUP BY codigo HAVING COUNT(*)>1;

-- Estado del conteo, cantidad (incluyendo cero), responsable y fecha exacta.
SELECT c.id, c.tipo, c.estado, c."iniciadoEn", c."finalizadoEn",
       p."codigoInterno", p.nombre, l."stockTeorico", l."stockFisico",
       l.diferencia, u.nombre AS responsable, l."contadoEn",
       l."asignadoPorId", l."asignadoHasta"
FROM "conteosInventario" c JOIN "conteoLineas" l ON l."conteoId"=c.id
JOIN productos p ON p.id=l."productoId"
LEFT JOIN usuarios u ON u.id=l."contadoPorId"
WHERE c.id='ID_DEL_CONTEO' ORDER BY p.nombre;

-- Comparar el detalle administrativo: progreso, participantes y valor al costo registrado.
SELECT c.id, COUNT(l.id) AS productos, COUNT(l."stockFisico") AS contados,
       COALESCE(SUM(l."stockFisico"),0) AS unidades,
       COALESCE(SUM(GREATEST(-l.diferencia,0)*l."costoUnitarioConteo"),0) AS faltantes,
       COALESCE(SUM(GREATEST(l.diferencia,0)*l."costoUnitarioConteo"),0) AS sobrantes,
       (SELECT COUNT(*) FROM "participantesConteo" pc WHERE pc."conteoId"=c.id) AS colaboradores
FROM "conteosInventario" c LEFT JOIN "conteoLineas" l ON l."conteoId"=c.id
WHERE c.id='ID_DEL_CONTEO' GROUP BY c.id;
```

Una escritura responde tras COMMIT. La revisión agrupa lecturas durante 250 ms; las otras pantallas consultan cada dos segundos más latencia. Si ocurre un 429, esperar el tiempo indicado y reintentar con la misma operación; no crear otra venta porque una tarjeta tarde en actualizarse.


Validación de esta revisión (11/10/2026): contrato de 14 enums, API, tipos, frontend y lint terminaron correctamente. Se comprobaron instalación inicial vacía, alias, conflictos con rollback, cero, roles, rotación, QR/EAN-13 sobre video sintético y vistas 390/768/1440. La regresión de tres colaboradores pasó, al igual que caché y reintentos: 23 solicitudes produjeron cuatro pedidos confirmados distintos según las cuatro intenciones, con un único cobro por clave. Se conservan advertencias de lint anteriores; este resultado no certifica carga máxima ni micrófono físico. La revisión de secretos del repositorio pasó.


### Recuperación de sesión en V7P4 (11/10/2026)

`GET /auth/me` es una consulta opcional: devuelve usuario válido o `data: null`. Para indicar `renovable: true`, verifica el hash de la cookie en `sesiones`, su vencimiento, revocación y el estado activo del usuario. Si la sesión terminó, elimina las cookies antiguas; el frontend limpia la sesión y presenta el ingreso sin intentar renovar una cookie inválida. Un acceso JWT vencido puede recuperarse si su renovación sigue vigente. Esta respuesta no autoriza operaciones privadas.

Prueba reproducible: `node Backend/scripts/probar-sesion-ui.cjs --api-real`. Requiere API QA en 8180 y PostgreSQL QA en 5433, base `ambie_test`, con el administrador ficticio de pruebas. Se aprobaron 12 casos: seis de transporte controlado (anticipación, respuestas tardías, revocación, caída de red, cancelación y reintento de guardado) y seis con API/PostgreSQL reales (sin cookies, cookies inexistentes, sesión revocada, renovación vencida, acceso vencido y solo cookie de renovación). Se verifican cookies HttpOnly, nuevo ingreso y cierre. Solo modifica sesiones ficticias; conserva documentos del negocio.

Ejercicio manual: recarga `http://127.0.0.1:8180`, inicia sesión, navega a un módulo y vuelve a recargar. Debe conservar una sesión válida. Al salir, la recarga debe mostrar el ingreso sin llamar a renovación. Usa el mismo dominio durante la prueba: `localhost` y `127.0.0.1` conservan cookies diferentes. Un 401 directo de `/auth/refresh` sigue siendo correcto si la sesión fue revocada, venció o no existe; no se permite recuperar una sesión inválida ni se oculta ese rechazo.


## V8P4 · Marca, acceso, apariencia e instalación

Prueba: `node Backend/scripts/probar-v8p4.cjs` contra API QA 8180, PostgreSQL QA 5433 (`ambie_test`) y Chrome. Comprueba 13 grupos: acceso system por correo y rechazo de duplicados; roles; apariencia persistida y modificación exclusiva del administrador; validación de contraste y firmas de imágenes; retiro conservando cantidad, responsable y fecha del conteo; protección de system; permisos individuales y revocación; interfaz 390×844, 768×1024, 1440×900 y acceso con scroll 320×320; vendedor dirigido a su pantalla y conteo diario; manifiesto/iconos/service worker válidos para instalación, sin CacheStorage privado y recuperación tras desconexión. Incluye guardar una imagen propia desde el formulario y comprobar su persistencia al recargar. El perfil PWA es normal: Chrome no instala en incógnito.

Se aprobaron también los 12 casos de sesión, caché y reintentos (23 solicitudes para cuatro operaciones distintas). Los datos de prueba permanecen en QA; la apariencia de QA se restaura al terminar. La instalación física en Android/iOS y la cámara física requieren validación del usuario.

Ejercicios de negocio: ingresar con `system` o su correo usando la contraseña de la instalación; crear administrador del negocio; crear dos colaboradores de inventario y abrir el mismo conteo general desde sus celulares. Cada producto debe reservarse a un único colaborador; guardar cero conserva el cero. Al retirar al colaborador, su trabajo debe seguir apareciendo con su nombre en el detalle. Un vendedor ve ventas y conteo diario; no puede consultar administración ni conteo general.

Ejercicio visual: Configuración → Apariencia → cambiar una paleta, código de color, fuente y portada → Guardar apariencia → recargar o abrir otro dispositivo. Ambos deben conservar la elección. Descartar cambios solo revierte la vista previa. Un color ilegible o archivo inválido debe explicar el problema y conservar lo guardado.

Consultas de lectura:

```sql
SELECT codigo, nombre, rol, activo, "eliminadoEn", "permisosDenegados"
FROM usuarios ORDER BY "creadoEn" DESC;
SELECT id, "actualizadoEn", configuracion - 'imagen' AS apariencia
FROM "configuracionesVisuales";
SELECT c.id AS conteo, p.nombre AS producto, l."stockFisico", l."contadoEn",
       u.nombre AS responsable, u."eliminadoEn" AS usuario_retirado
FROM "conteoLineas" l JOIN "conteosInventario" c ON c.id=l."conteoId"
JOIN productos p ON p.id=l."productoId"
LEFT JOIN usuarios u ON u.id=l."contadoPorId"
WHERE l."contadoEn" IS NOT NULL ORDER BY l."contadoEn" DESC;
```

Validación adicional V8P4 con imágenes Docker y servicios QA reales (11/10/2026): los 18 casos de integración aprobaron permisos, renovación, reserva/stock, pagos, FIFO, caja, cancelación, compras, archivos e historial. El recorrido completo de paneles en Chrome aprobó filtros, borradores, sincronización y desplazamiento; comprobó formularios de cliente y venta contra PostgreSQL, totales y valores de venta históricos. Los 32 casos de agentes son pruebas controladas: no equivalen a audios físicos ni a una respuesta de un proveedor externo.

Producción V8P4 comprobada el 11/10/2026: frontend y API llevan la etiqueta V8P4; PostgreSQL, Redis, MinIO, API y frontend saludables, migración con salida 0. El respaldo previo de 168.998 bytes se leyó completamente con pg_restore sin ejecutarlo ni restaurarlo. Antes y después coinciden 15 pedidos (también sus identificadores), 371.600 en total de documentos, ocho clientes, 32 productos, 857 unidades físicas, 20 reservadas, tres conteos, diez pagos y dos usuarios. El acceso system por correo funcionó en localhost y en el túnel HTTPS; las cookies externas son Secure y HttpOnly. Las ventas, número de pedidos y el historial se conciliaron contra PostgreSQL. Chrome recorrió Inicio, Pedidos, Inventario, Productos, Usuarios y Configuración en 390/768/1440 desde ambos orígenes, sin desbordamiento horizontal ni errores de ejecución; manifestó cero obstáculos de instalación PWA y ninguna caché privada. No se crearon operaciones comerciales de prueba en producción. El enlace temporal cambia al reiniciar el túnel: usar un dominio estable para una instalación permanente.

### Ejercicios de etiquetas y presentaciones — ajustes V8P4
1. Inventario → Stock general → + Producto: escanea una etiqueta nueva, escribe parte del nombre. Si el producto ya existe, selecciónalo y vincula la etiqueta: su código interno, stock e historial se conservan. Si no existe, completa nombre, unidad, costo, precio y mínimo; cantidades por Compras o inventario inicial. En el inventario inicial no se solicitan costo ni precio. La fotografía mantiene el proceso existente.
2. Productos: abre un producto, cambia su nombre y confirma el resumen. Desde Crear presentación registra, por ejemplo, 250 ml y 1 litro; cada una tendrá su código y existencias. Una misma presentación repetida, incluso con mayúsculas diferentes, se rechaza. Retira una etiqueta antigua desde Códigos después de verificar que la nueva lee correctamente.
3. Listas: usa la paginación en móvil/tablet/escritorio. La lista completa de esa página se desplaza con la pantalla, sin scroll interno; los cuadros de formulario y escáner mantienen el desplazamiento necesario para acceder a sus campos.
4. Robot: un toque inicia escucha, otro corta solamente el micrófono y conserva el procesamiento/respuesta pendiente. Dos toques rápidos apagan escucha, respuesta y solicitud pendiente. Tocar fuera cierra solo el texto. Se conservan los límites de duración y volumen del servicio de audio; al terminar una sesión puedes volver a tocar el robot. Detener el micrófono no descarta una operación que ya se está interpretando. Durante la voz sintetizada no se envía sonido al reconocedor, para evitar autoescucha.

Pruebas reproducibles solo en contenedores QA: `node Backend/scripts/probar-presentaciones.cjs`, `node Backend/scripts/probar-escaner-ui.cjs`. Las etiquetas QR y EAN-13 se generan en la prueba y se presentan mediante un video sintético en Chrome: el lector real las decodifica. Esta prueba no sustituye la cámara física de un celular. No se descarga un modelo nuevo ni se utiliza un servidor de desarrollo.

```sql
-- Un producto comercial y sus presentaciones.
SELECT rowid, rowid_ext, "codigoInterno", nombre, extension
FROM "identidadesProducto" WHERE rowid='ID_PRINCIPAL' ORDER BY extension;
-- Stock y valor actuales por presentación, sin duplicar el principal.
SELECT COALESCE("productoBaseId",id) AS rowid, id AS rowid_ext,
       nombre, "stockFisico", "stockReservado", "precioVenta", "costoActual"
FROM productos WHERE id='ID_PRINCIPAL' OR "productoBaseId"='ID_PRINCIPAL';
-- Unidades e importes históricos por producto/presentación (ventas no canceladas).
SELECT COALESCE(p."productoBaseId",p.id) AS rowid, p.id AS rowid_ext,
       SUM(l.cantidad) AS unidades, SUM(l.subtotal) AS ventas
FROM "pedidoLineas" l JOIN productos p ON p.id=l."productoId"
JOIN pedidos d ON d.id=l."pedidoId"
WHERE d.estado<>'cancelado' AND d."fechaOperacion" BETWEEN '2026-10-01' AND '2026-10-31'
GROUP BY COALESCE(p."productoBaseId",p.id),p.id;
-- Debe devolver cero filas: presentaciones repetidas y etiquetas duplicadas.
SELECT "productoBaseId", lower(btrim(extension)), COUNT(*) FROM productos
WHERE "productoBaseId" IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1;
SELECT codigo,COUNT(*) FROM "codigosProducto" GROUP BY codigo HAVING COUNT(*)>1;
```

Resultado de los ajustes V8P4 (11/10/2026): compilación/contrato/tipos/lint aprobados; 18 casos de integración y 33 pruebas controladas de agentes aprobados. Los ejercicios de presentaciones comprobaron alias idempotentes, retiro de etiqueta, dos IDs, stock independiente, duplicados concurrentes y factura histórica. Chrome aprobó ocho grupos del escáner/robot, incluida respuesta pendiente conservada después de detener el micrófono. La lectura sintética QR inicial tardó 1.543 ms y EAN-13 posterior 154 ms en esta ejecución; no representan una garantía de latencia en cámaras físicas. Dos audios existentes se transcribieron con Whisper base (25.388 ms inicial y 4.683 ms siguiente). El WebSocket real confirmó listo → voz → texto → instrucción en 20.018 ms, incluyendo la duración del audio de prueba. No se descargaron modelos y no se arrancó Vite ni otro servidor de desarrollo.

Prueba externa autorizada: OpenCode Zen/space-bunny-free rechazó sus credenciales o permisos en QA; no se guardó un pedido. Gemini de producción respondió a la orden ficticia en 1.051 ms y preparó un borrador; inicialmente omitió cliente ocasional. Se añadió descripción de ese campo y normalización del literal cliente ocasional, manteniendo intactos los clientes registrados y los valores false explícitos. La conexión de producción sigue siendo la elegida por el administrador. Los límites de recursos del servidor de audio se conservaron.

Cierre de los ajustes V8P4: el recorrido completo de paneles y ventas pasó también después de retirar el scroll interno de listas. Los siete grupos de presentaciones incluyen asignar Individual al producto existente sin cambiar su ID, rechazar otra combinación igual y crear Paquete de 6 desde el formulario con nombre principal, categoría Bebidas, costo 6.000, precio 12.000 y stock cero. La categoría y la carga de foto del alta anterior se conservan. Gemini de producción respondió a la orden autorizada con ocasional=true, método billetera y cero datos faltantes (1.329 ms), sin guardar una venta. El WebSocket real por HTTPS recibió voz, texto e instrucción en 26.547 ms, incluyendo audio de prueba y carga inicial del motor.

Compatibilidad CSV de presentaciones verificada: reimportar el nombre exportado de un producto con extensión no duplica su sufijo, conserva su ID, categoría y stock. El editor transaccional devuelve el nombre canónico que guarda el importador.

Verificación final en producción: todos los identificadores del respaldo previo permanecen (20 pedidos, 35 productos, ocho clientes y 15 pagos). La diferencia con la instantánea anterior de 18 pedidos corresponde a nuevas operaciones guardadas mientras se validaba. Se compararon stocks con la suma de deltas del ledger, reservas con cantidadReservada − cantidadConsumida − cantidadLiberada y totales con líneas: cero diferencias en los tres controles. API, frontend, PostgreSQL, Redis, MinIO y audio saludables; localhost y HTTPS sirven V8P4 con el asistente habilitado. QA se retiró conservando sus volúmenes; el volumen de reconocimiento existente permanece disponible para producción.

### Productos, compras y correcciones V8P4 · 11/10/2026

Alta retirada de Inventario y del endpoint exclusivo del inicial. Compras y Productos reutilizan la ficha de código, nombre, unidad, presentación, costo, importe y mínimo. No se borran tablas ni registros ni se duplica el catálogo. La corrección desde Stock general usa físico, conserva reservas y se registra en Descuadres e Inicio con responsable, fecha y costo histórico.

Pruebas actuales sobre imágenes Docker QA: compilación completa, dos pruebas de caché, 18 casos de integración, nueve grupos de códigos/inicial/colaboradores y recorrido real de diez módulos en 320/393/768/1440. La prueba de tablero confirmó períodos, límites de Bogotá, costos históricos, exclusión de cancelados y ausencia de doble contabilización al aplicar. Proveedores y compras ficticios se conservaron en QA.

Ejercicio nuevo: proveedor Distribuciones Centro, 12 paquetes de galletas a 1.200, total 14.400; Suministros Norte, siete botellas a 800 y cinco bolsas a 3.000, total 20.600. PostgreSQL coincidió con cada campo y ledger; un reintento concurrente devolvió la misma recepción. Caché del tablero reflejó 35.000 de compras y luego respondió hit. El vendedor ya conectado vio las cantidades sin recargar; el colaborador contó el producto comprado y se comprobaron sus permisos.

Con dos unidades reservadas, corregir físico 12→10→13 generó -2/-2.400 y +3/+3.600. Cada diferencia apareció una sola vez en historial y tablero, con autor y fecha. Se rechazó bajar a una unidad, sin cambios al stock. En la última ejecución local de QA, las respuestas del alta y la recepción demoraron 182 y 214 ms; el vendedor vio la recepción a los 1.564 ms desde el inicio de confirmar. Incluyen navegador, API y sincronización; no son una garantía de latencia para otros equipos ni una escritura diferida en PostgreSQL.

Reproducir: npm run prueba:productos:compras. Consultas y detalle de tablas en GUARDADO_Y_CONCILIACION_V4P2.md. Las pruebas comerciales no se ejecutan en producción.
