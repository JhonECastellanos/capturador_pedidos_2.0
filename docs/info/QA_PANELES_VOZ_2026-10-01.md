# QA de paneles y asistente — 01/10/2026

Resultado: dos pasadas completas aprobadas de 11 paneles e Inicio; interpretación y varios productos aprobados dentro del alcance simulado/QA. Una incidencia reproducida de preparación del test y una observación intermitente de Precios. Sin críticos de negocio confirmados; micrófono físico pendiente.

## Alcance

Revisión de los 11 paneles administrativos, Inicio y subpantallas; interpretación del asistente, confirmación de cliente y varios productos en un turno. Resultados de esta ejecución, separados de las auditorías históricas.

- Entorno real: Nginx/API/PostgreSQL/Vosk del proyecto aislado `ambie-integracion`, frontend 8180 y API 3100.
- Entorno simulado: componentes compilados en Chrome con API y transcripciones artificiales.
- Sin llamadas a proveedores remotos, sin claves externas y sin cambios en el negocio.
- Evidencia visual privada: `.local/pruebas-ui/`.

## Estado de ejecución

| Comprobación actual | Resultado |
|---|---|
| `npm.cmd run verificar` | Aprobada; contrato de 14 enums, API/CLI y frontend compilados. Lint con advertencias, sin errores. |
| `node --test Backend/scripts/probar-asistente.cjs` | 11 pruebas aprobadas, 0 fallos. |
| `node Backend/scripts/probar-asistente-ui.cjs` | Aprobada para vendedor y administrador en Chrome; API/transcripciones simuladas. |
| `npm.cmd run prueba:integracion` | 19 casos aprobados contra API/PostgreSQL QA, 0 fallos. |
| `npm.cmd run demo:catalogo` | Catálogo ficticio QA preparado: 32 productos, 8 clientes; 304 pedidos visibles al terminar la preparación. No representa pedidos creados en esta ejecución. |
| `npm.cmd run prueba:paneles` | Dos recorridos completos consecutivos aprobados después de preparar la venta QA de hoy. Antes hubo dos bloqueos por fixture y un fallo de nodos en Precios; se conserva esa evidencia. |
| `npm.cmd run prueba:voz` | Aprobada: permisos/configuración privada, conexión API→Vosk, mensajes inválidos, origen y ticket de un solo uso. Audio sintético de transporte. |

## Hallazgos

### QA-001 — Prueba de paneles depende de un pedido demo en el día actual

Severidad: media, automatización/fixtures. No se ha acreditado un fallo del buscador de la aplicación.

Reproducción actual:

1. Reconstruir QA y ejecutar integración más `demo:catalogo`, conservando sus volúmenes.
2. Ejecutar `prueba:paneles`: Inicio y estabilidad de Ventas pasan.
3. El recorrido busca `Isabel` dentro de **PEDIDOS DE HOY** y espera `Isabel Rojas`.
4. Dos intentos terminan con `locator.waitFor: Timeout 30000ms exceeded`, en esa misma expectativa.
5. Navegador exploratorio: hay seis pedidos de hoy, ninguno de Isabel; buscar Isabel da una lista vacía. Zona observada `America/Bogota`, fecha UTC `2026-10-01T07:58:04.948Z`.

Evidencia privada: `.local/pruebas-ui/qa-20261001/screenshots/ventas-inicial.png` y `ventas-isabel-sin-pedido-hoy.png`. El catálogo informa 304 pedidos visibles, pero ese total no garantiza una venta de cada cliente en el día actual. Preparar una venta ficticia de Isabel para hoy y repetir permite distinguir el supuesto del test de un fallo funcional; no se borran datos.

Preparación adicional realizada desde los controles normales de Chrome: **PED-0305 / FAC-0305**, cliente ficticio Isabel Rojas, 1 Doritos queso 85 g a $5.200 y 1 Pepsi 400 ml a $3.000, efectivo, entregado, total $8.200. La factura mostró ambas líneas después del guardado. Captura privada: `.local/pruebas-ui/qa-20261001/screenshots/factura-isabel-multiproducto.png`. Sin errores JavaScript en la sesión exploratoria al revisar el resultado. El recorrido completo se repite después de esa preparación.

La preparación de PED-0305 permitió aprobar dos recorridos completos consecutivos. Recomendación para el harness: garantizar una venta demo del cliente esperado en la fecha del filtro, o seleccionar explícitamente un rango que contenga su venta, sin depender del día de una ejecución anterior.

### QA-002 — Comprobación de nodos en Precios falla durante sincronización

Estado: observación intermitente, no corregida ni confirmada como fallo reproducible del producto. En el tercer recorrido, después de preparar PED-0305, pasaron Inicio, Ventas, Pedidos, Créditos, Inventario y Compras. La prueba se detuvo en `Precios: conserva nodos`. Se añadió evidencia al test (captura y valores de las referencias/scroll), conservando su mismo criterio de aprobación. Los dos intentos siguientes pasaron esa comprobación y todos los paneles. No se han corregido ni alterado componentes del aplicativo en esta revisión. Se requiere conservar el diagnóstico si reaparece; no descartar el primer fallo porque luego haya pasado.

## Cobertura de paneles reales

Chrome sobre Nginx/API/PostgreSQL QA, con tres eventos de actualización por panel para comprobar que no se reemplazan nodos ni se reinicia scroll/documento:

| Panel | Recorrido aprobado |
|---|---|
| Inicio (adicional a los 11 paneles) | Sincronización y cambios de periodo en gráfico. |
| Ventas | Buscar por cliente; cliente → productos → cliente → inicio, sin guardar el borrador. |
| Pedidos | Búsqueda; detalle informativo y regreso al listado. |
| Créditos | Saldo del cliente y regreso a pendientes. |
| Inventario | Límite de 30, búsqueda de presentaciones; regreso de stock, conteo, descuadres y ajustes. |
| Compras | Nueva recepción y regreso al historial sin guardar. |
| Precios | Producto → revisión → edición conservando precio, sin escritura. Véase QA-002. |
| Caja | Filtro reversible y cancelación de egreso sin guardar. |
| Cierre | Conteo → resumen → conteo conserva valores; regreso al historial. |
| Usuarios | Formulario → revisión → edición conserva borrador, sin crear acceso. |
| Auditoría | Sincronización y filtros. |
| Configuración | Diagnóstico del servicio local de voz y regreso, sin proveedor externo. |

Tamaños comprobados por el recorrido: 390×844, 390×320, 1440×320; recorrido principal en 1440×900. Sin desbordamiento horizontal; tarjetas de al menos 64 px, listas de al menos 160 px y scroll exterior con poca altura. Se revisaron las capturas actuales de factura móvil y Precios con poca altura; la factura conserva scroll interno sobre su pie fijo.

## Asistente y varios productos

- Pruebas unitarias: varias cantidades habladas, 32/22 unidades, presentaciones 400 ml/1,5 L, rechazo de cantidades incompletas/fraccionarias/no positivas, agregar y reemplazar explícitamente, ambigüedad sin selección arbitraria.
- Agrupación: espera de 2.200 ms, une finales y vuelve a esperar ante parciales. AudioWorklet verifica PCM a 16 kHz desde 16/44,1/48 kHz; no es una prueba de reconocimiento acústico.
- Chrome simulado, ambos roles: seleccionar cliente real, confirmar identidad sin escritura, volver por voz/botones conservando borrador, completar entrega/pago y guardar solo con confirmación explícita.
- Dictado múltiple y segmentado: Pepsi 400 ml y Doritos; quitar/agregar/acumular, rechazar stock insuficiente y conservar lista anterior. Venta ocasional sin crédito. La API y el audio de este recorrido son simulados.
- Chrome real QA: PED-0305 / FAC-0305, dos productos seleccionados manualmente y guardado normal de $8.200.
- Recorrido automatizado real: venta ocasional con 2 Coca-Cola 400 ml a $3.500 y 3 Doritos queso a $5.200, total $22.600; consulta del pedido y recarga mantienen líneas/precios históricos aunque el catálogo cambie a $9.000. La captura del primer recorrido completo corresponde a PED-0306 / FAC-0306; registros ficticios conservados.
- Vosk real QA: permisos, ticket, origen y transporte de audio sintético aprobados. No se acredita micrófono físico ni reconocimiento de las frases dictadas por un usuario real.

Advertencias reproducidas por `verificar`: `react(purity)` y `react(set-state-in-effect)` en pantallas y fachada remota. No se ocultaron ni se modificó la configuración para silenciarlas. Se registra deuda técnica; este resultado no demuestra un fallo de negocio.

## Límites

Los recorridos simulados no acreditan reconocimiento acústico, micrófono físico, acentos, ruido, TTS instalado ni HTTPS/VPS real. Las pruebas de una muestra no garantizan ausencia absoluta de fallos.

## Cierre de esta revisión

- [x] 11 paneles administrativos, Inicio y subpantallas: dos pasadas completas aprobadas después de la preparación documentada.
- [x] Interpretación, confirmar cliente y dictado múltiple: 11 pruebas unitarias y Chrome simulado para ambos roles aprobados.
- [x] Agregar varios productos: validado en el dictado simulado y en facturas reales QA con todas sus líneas persistidas y precios históricos.
- [x] Hallazgos y resultados documentados: QA-001 reproducido, QA-002 intermitente y advertencias de lint conservadas.

No se confirmaron fallos críticos de negocio en el alcance probado. No implica aprobar micrófono físico ni certificar todos los casos posibles. Rama observada: V3. Los cambios de esta revisión son este informe y diagnóstico adicional del test; no se implementaron correcciones de negocio/UI ni se hizo commit, push o despliegue del negocio. El navegador exploratorio y su perfil temporal de autenticación se retiraron; QA se retiró con `down` sin `-v` (código 0), conservando sus registros y volúmenes. Capturas privadas, no destinadas a Git.
