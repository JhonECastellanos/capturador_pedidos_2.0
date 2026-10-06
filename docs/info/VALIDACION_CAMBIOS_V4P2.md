# Validación de guardado, resumen e inventario inicial — V4P2

Pruebas realizadas el 6 de octubre de 2026 sobre la instalación aislada `ambie-integracion`: Nginx 8180, API 3100 y PostgreSQL `ambie_test`. Las cifras de QA son ficticias. El informe anterior de [guardado](VALIDACION_GUARDADO_V4P2.md) corresponde a una versión previa a estas correcciones.

## Cambios comprobados

- Guardado con una clave por intención y confirmación persistida en la misma transacción del documento. Repetir una clave confirmada devuelve el resultado original. No vuelve a cobrar, mover stock ni auditar la operación.
- Estado y cantidades consumidas/liberadas de las reservas se actualizan juntos. Una restricción de PostgreSQL impide guardar otra vez contadores incompatibles con el estado.
- Inicio del administrador con ventas, gastos, compras, compras más gastos y ticket promedio del mes. Usa el resumen existente; no agrega otra fórmula contable en el servidor.
- Etiquetas de valores en los gráficos al pasar el mouse o enfocar con teclado; ocultas en reposo.
- Inventario inicial mediante el conteo y ajuste existentes. Conserva nombre, cantidad y costo de partida, y compara el stock actual con los movimientos posteriores.

## Ejercicios y resultados

| Ejercicio | Comprobación | Resultado |
|---|---|---|
| Repetir y enviar simultáneamente la misma confirmación | 23 solicitudes, pedidos, pagos, físico y reservas consultados también con SQL | Cuatro pedidos legítimos: tres ventas entregadas y uno cancelado; ningún documento o cobro repetido |
| Usar la misma clave con otros datos | Rechazo 409 | No altera el documento original |
| Intentar vender más stock y corregir el intento rechazado | Rollback y reutilización de la clave aún no confirmada | Sin datos parciales ni consumo del consecutivo rechazado |
| Cortar la respuesta de creación de producto después del commit | Chrome real, recarga, formulario idéntico y misma clave | Un producto y un movimiento, recuperando el mismo UUID |
| Inventario inicial completo | Inicio incompleto rechazado; cambio de stock durante el conteo rechazado; cancelación y nuevo conteo; doble aplicación con la misma clave | Un ajuste aplicado para 146 productos ficticios; valor inicial $3.959.105 |
| Repetir la prueba sobre el inicio aplicado | Conserva el inicio existente, rechaza edición/cancelación/reemplazo | No crea otro punto de partida |
| Recibir dos veces la misma compra de dos unidades | Una recepción, aumento de dos unidades y consulta de comparación | Cantidad y costo iniciales conservados; cero diferencias de stock |
| Buscar y abrir la segunda página del inicio | Máximo 30 filas por página, totales generales antes del filtro | No recorta el valor ni las cantidades totales |
| Tarjetas del mes | Texto visible en Chrome, API y sumas SQL por fecha operativa de Bogotá | Coinciden ventas, gastos, compras y ticket promedio; compras más gastos coincide con la suma |
| Etiquetas de gráficos | Hover, salida del mouse y foco de teclado | Visibles solo durante la interacción |
| Recorrido de paneles | Doce módulos, tres actualizaciones por módulo, filtros, borradores y retroceso | Conserva los nodos de las pantallas y el scroll; sin errores de ejecución |
| Factura móvil | Venta real QA de dos productos, cantidades 2/3, total $22.600; cambio posterior de precios y recarga | Conserva líneas y precios de la venta original |
| Navegación y confirmación por voz | Transcripciones controladas; formularios, API y base reales | Quince casos correctos; pedido y abono sin doble escritura al repetir la confirmación |
| Diccionario del modelo | Nombres de tablas, columnas y nulabilidad del esquema comparados con PostgreSQL | 38 tablas y 335 columnas coinciden |

La apertura y aplicación completa del inicio se probaron antes de conservarlo para las repeticiones de esta jornada. Las repeticiones posteriores no eliminan ese registro. El abono del recorrido por voz usa interpretación controlada; el pedido utiliza la interpretación básica local. Esto no prueba un micrófono físico ni el reconocimiento acústico de frases.

También pasan los 19 casos de integración de negocio, las 20 pruebas de reglas del asistente y las dos pruebas de caché y de claves de guardado. La compilación de contrato, enums, API, CLI, scripts y frontend, y la revisión de tipos y lint, pasan. Lint conserva advertencias ya existentes.

## Tiempo de confirmación y actualización

Treinta pedidos a crédito, de una unidad y $1.200 cada uno, enviados en serie con clave de guardado. Tras cada respuesta se consultaron directamente el pedido y su línea en PostgreSQL, y después el detalle por API.

| Medida | Mediana | Percentil 95 | Máximo |
|---|---:|---:|---:|
| Respuesta de escritura, incluyendo commit | 110,23 ms | 161,03 ms | 170,07 ms |
| Observación posterior con Docker y psql | 363,67 ms | 434,91 ms | 445,83 ms |
| Lectura posterior del detalle por API | 16,87 ms | 41,81 ms | 42,04 ms |

La observación con SQL incluye el arranque de Docker/psql: **no es un tiempo adicional de guardado** ni mide el instante exacto del commit. Al recibir la respuesta, el documento ya estaba confirmado.

Diez productos creados desde otra sesión aparecieron en Inventario sin pulsar actualizar: mediana de **1.333,89 ms** y máximo de **1.863,86 ms** desde la respuesta hasta aparecer. El tiempo completo desde enviar hasta verlo fue de 1.435,71 ms de mediana. La consulta periódica de revisión es cada dos segundos más latencia; no promete entrega visual instantánea.

## Carga concurrente

| Operación | Solicitudes | Concurrencia | Confirmadas / correctas | Errores | p95 |
|---|---:|---:|---:|---:|---:|
| Pedidos, lote 1 | 20 | 5 | 20 | 0 | 535 ms |
| Pedidos, lote 2 | 50 | 10 | 50 | 0 | 751 ms |
| Pedidos, lote 3 | 100 | 20 | 100 | 0 | 2.197 ms |
| Lecturas cruzadas administrador/vendedor | 300 | 30 | 300 | 0 | 306 ms |
| Consulta de revisión | 300 | 30 | 300 | 0 | 170 ms |

Se verificaron 170 UUID y consecutivos distintos, lectura de todos los pedidos, físico 170, reservado 170, ventas y cartera de $1.700. La solicitud adicional sin disponible se rechazó sin aumentar las reservas. Estos resultados describen esta ejecución local, no una capacidad máxima ni ausencia absoluta de errores.

## Migración y despliegue

La prueba inicial en QA detectó eventos de triggers diferidos pendientes al añadir el CHECK de reservas. La transacción se revirtió, conservando los datos. La migración corregida ejecuta esos eventos antes del ALTER TABLE dentro de la misma transacción y se aplicó correctamente. La comprobación de salud de PostgreSQL QA ahora consulta su propia base `ambie_test`.

Las migraciones agregan el tipo de conteo inicial, la confirmación técnica de escritura, tres campos del snapshot inicial, índices de unicidad y la coherencia de reservas. La semilla no crea inventario inicial ni datos comerciales nuevos.

El despliegue local de producción terminó a las 17:30 de Bogotá: seis servicios saludables, migración con salida 0 y diez migraciones aplicadas. El respaldo previo quedó en `.local/backups/antes-despliegue-20261006T222819115Z.dump`, con 138.093 bytes. Se conservaron 32 productos, ocho clientes y ocho pedidos; PostgreSQL tiene las 335 columnas y ninguna reserva incoherente.

Chrome verificó las cinco tarjetas mensuales y **Contar inventario inicial** en `http://localhost:8080`, sin ejecutar escrituras comerciales. El negocio aún no tiene un inicio aplicado: debe contar sus existencias reales. La pantalla de acceso también permite alcanzar el botón Ingresar a 320×320 mediante scroll. No hubo errores de ejecución en ese recorrido. Los contenedores QA se retiraron conservando sus volúmenes.

## Repetir las comprobaciones

```powershell
docker.exe compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz up -d --wait
npm.cmd run verificar
npm.cmd run prueba:guardados
npm.cmd run prueba:inventario:inicial
npm.cmd run prueba:integracion
npm.cmd run prueba:carga
npm.cmd run prueba:persistencia
node Backend/scripts/probar-guardado-ui.cjs
node Backend/scripts/probar-sincronizacion-tiempo.cjs
npm.cmd run prueba:paneles
```

Ejecutar las suites que escriben una detrás de otra en QA. Paneles requiere primero el catálogo ficticio indicado en README. Las credenciales y resultados privados permanecen en `.local`, fuera de Git. Al terminar, retirar QA con `down` **sin `-v`** para conservar sus volúmenes.

## Ejercicios adicionales para la persona encargada

1. En **Inventario → Inventario inicial**, contar cada producto, incluyendo cero cuando no haya unidades. Revisar y confirmar el inicio durante una pausa de operaciones. Comprobar que el físico quedó en la cantidad contada, no sumado a la cantidad anterior.
2. Vender dos unidades de un producto del inicio y recibir después una compra de tres. Su stock esperado debe terminar una unidad por encima del inicial; el costo de partida debe seguir igual.
3. Crear un pedido pendiente y cancelarlo. Confirmar que se liberó la reserva y que no cambió el físico. Comparar pedido, reserva y movimientos por sus UUID con las consultas de la guía.
4. Registrar un gasto y una compra con fecha operativa del mes. Comparar las tarjetas con los documentos y las sumas SQL, excluyendo pedidos cancelados de ventas y ticket.
5. Abrir dos sesiones. Confirmar una operación en una y observar su aparición en la otra sin refrescar manualmente. Una espera visual breve no significa que la base siga sin guardar.

Para interpretar cada campo y evitar sumar dos veces documentos, aplicaciones o confirmaciones técnicas, consultar el [diccionario](DICCIONARIO_DATOS_V4P2.md) y la [guía de guardado y conciliación](GUARDADO_Y_CONCILIACION_V4P2.md).
