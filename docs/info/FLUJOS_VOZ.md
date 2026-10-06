# Voz sobre los flujos existentes

## Arquitectura

Micrófono seleccionado → PCM 16 kHz → Vosk local → intención → formulario existente → revisión existente → confirmación → servicio normal → PostgreSQL.

Solo existe un transcriptor local: `infra/voz/`, dentro del proyecto Docker. No se guarda audio del usuario. El CLI permanece independiente. El proveedor de interpretación y su modelo se configuran desde Configuración; el modo básico no consume APIs externas.

Durante el dictado no se modifican formularios. Se agrupan transcripciones hasta 2200 ms sin nuevas palabras; después se procesa la instrucción. Los estados son escuchando, procesando y listo para confirmar. La respuesta breve desaparece en 3500 ms, ocupa como máximo dos líneas y no bloquea controles.

## Comandos

- «Crea un pedido para Isabel Rojas de dos Pepsi 400 ml, entrega inmediata, pago en efectivo»: resuelve registros reales y abre el detalle final de Ventas.
- «Cambia las dos Pepsi 400 ml por cinco y el pago a transferencia»: actualiza el borrador y muestra el mismo detalle.
- «Confirma» / «confirmar operación»: usa el guardado de la pantalla revisada. Un segundo comando no repite el documento.
- «Cancelar»: descarta el borrador, no elimina documentos registrados.
- «Volver»: usa el retroceso del flujo; conserva sus datos. Si esa pantalla no ofrece un retroceso integrado, indica usar su control manual sin borrar el borrador.
- «Revisar operación»: incorpora correcciones manuales y vuelve a la revisión. Contraseñas se escriben exclusivamente en el formulario, nunca se envían al intérprete.
- «Abrir inventario», «abrir créditos», «abrir pedidos», etc.: abre la sección permitida; no guarda transacciones.

Crear pedido, hacer pedido y crear venta son Ventas. Pedidos consulta documentos ya registrados. Faltantes se preguntan sin inventar valores. Productos singulares/plurales y nombres parciales se aceptan solo cuando identifican una variante; presentaciones ambiguas exigen aclaración. Venta ocasional nunca admite crédito. Stock se valida antes de aplicar y nuevamente en la API.

El modo básico admite instrucciones sencillas y campos etiquetados separados por comas: «registrar egreso, concepto Transporte, monto cinco mil, método efectivo», «cambiar precio, producto Pepsi 400 ml, precio cinco mil». Frases arbitrarias más complejas dependen del proveedor configurado; no se garantiza entender cualquier redacción.

## Relación con pantallas

| Operación | Pantalla y acción existentes |
|---|---|
| Venta y correcciones | `FlujoVenta` → detalle de productos → `confirmarPedido` |
| Crear cliente | `CrearCliente` → guardado del formulario |
| Abono | `CreditosAdmin` / `Abonos` → confirmación habitual del cobro |
| Cobrar o cambiar estado de pedido | `PedidoDetalle` → cobro/confirmación de estado |
| Producto | `InventarioAdmin` → `FormularioProducto` |
| Precio | `PreciosAdmin` → revisión del precio → `guardarPrecio` |
| Stock y conteos | `InventarioAdmin` → ajuste/conteo/revisión existentes |
| Proveedor y compra | `ComprasAdmin` → formulario de proveedor o resumen de recepción |
| Gasto | `ComprasAdmin` → `FormularioGasto` |
| Egreso | `CajaAdmin` → formulario existente |
| Cierre y traslado | `CierreAdmin` → resumen o confirmación del pedido pendiente |
| Usuarios | `UsuariosAdmin` → revisión / confirmación de rol o estado |
| Consultas | Navegación de secciones; filtros y detalles habituales |

La autorización del frontend no sustituye los guardias de la API. Vendedor conserva solamente ventas, clientes y abonos. No se añade un modal ni un capturador separado.

## Pruebas reproducibles

En PowerShell, desde la raíz:

```powershell
npm.cmd run verificar
npm.cmd run prueba:asistente
npm.cmd run prueba:cache
docker.exe compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz up -d --build --wait
npm.cmd run prueba:integracion
npm.cmd run demo:catalogo
npm.cmd run prueba:paneles
npm.cmd run prueba:asistente:ui
npm.cmd run prueba:voz
npm.cmd run seguridad:repositorio
docker.exe compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz down
```

Nunca utilizar `down -v`. Pruebas de escritura están restringidas a QA 8180/3100 y conservan registros ficticios. Si falla una descarga de Vosk y su imagen ya está instalada, construir solamente `api frontend` y arrancar con `--no-build`; esto no valida reconstruir la imagen de voz desde cero.

`prueba:asistente:ui` usa Chrome con micrófono/transcripciones simulados, frontend recién compilado y proxy exclusivo hacia API/BD QA reales. Pedidos usan el intérprete básico real. Otros módulos reciben intenciones controladas: acreditan integración de formularios, confirmación y persistencia, no precisión de un proveedor remoto. Los tiempos incluyen la espera de agrupación del dictado, pero no son latencia de audio real. Resultados y capturas quedan privados en `.local/pruebas-ui/`.

`prueba:paneles` recorre los doce módulos en Nginx QA, conserva nodos/scroll tras sincronización, verifica retroceso y tamaños 390×844, 390×320 y 1440×320. Registra pedidos ficticios de hoy y una factura para comprobar precios históricos.

`prueba:voz` comprueba API→Vosk, silencio PCM, tickets, origen y permisos. Los ejercicios acústicos sintéticos son una comprobación separada: no sustituyen un celular con micrófono físico, ruido o acentos. Probar cada dispositivo por HTTPS, primero desde Configuración → diagnóstico sin guardar, y luego con pedidos QA completos, corrección y cancelación antes de confirmar.

En Windows, con una voz española instalada, genera los audios de prueba mediante `powershell.exe -NoProfile -File Backend/scripts/ejercicios-voz.ps1` y ejecuta `npm.cmd run prueba:voz:audio`. Transmite los ocho WAV por el WebSocket autenticado de QA a Vosk y comprueba cantidades, sabores, confirmación y ausencia de cantidades inventadas. No guarda ventas ni llama proveedores externos; respeta la espera entre reconexiones.
