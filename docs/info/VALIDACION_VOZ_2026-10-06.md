# Validación de voz y paneles — 6 de octubre de 2026

Rama: `V4P1`. Pruebas de escritura exclusivamente en `ambie-integracion`, API 3100 y frontend 8180, con PostgreSQL y volúmenes QA separados. No se consumieron proveedores remotos ni se modificaron datos del negocio.

## Resultados

- Compilación, contrato de 14 enums y verificación de tipos completos; lint sin errores, con advertencias existentes y una advertencia de referencias en la limpieza del micrófono.
- Asistente: 19 pruebas, incluida matriz de 40 expresiones, cantidades, variantes, correcciones, permisos, protección de contraseñas y catálogo Gemini simulado.
- Integración de negocio: 19 casos con API y PostgreSQL QA, incluidos permisos, coherencia de stock/caja/créditos y rechazo de cierres duplicados.
- Voz sobre frontend real: 34 recorridos registrados del administrador y 2 del vendedor. Se verificaron 23 peticiones de escritura del administrador y 2 del vendedor, sin repetirlas mediante una segunda confirmación. Un cobro usa sus dos acciones normales: pago y estado del pedido.
- Productos, precios, proveedores, compras, gastos, egresos, clientes, usuarios, abonos, cobros, traslado/cancelación de pedidos y ciclo de conteos comprobaron persistencia. Las doce secciones administrativas se abrieron por voz.
- Paneles: doce módulos, sincronización sin desmontaje ni pérdida de borradores/scroll, retroceso, factura con precios históricos y tamaños 390×844, 390×320 y 1440×320. Inspección visual de Ventas: un solo encabezado y tres tarjetas completas en 390×844.
- Audio: ocho WAV sintéticos atravesaron el WebSocket autenticado, API y Vosk; se comprobaron cantidades, sabores, confirmación y que no se inventen cantidades. Cuatro pruebas del cálculo de confianza pasaron dentro del contenedor.
- Tickets de un solo uso, permisos, rechazo de origen y mensajes WebSocket inválidos: correctos. Caché: 2 pruebas correctas.
- Escaneo del repositorio: 281 archivos versionados/nuevos, sin patrones sensibles detectados. No sustituye revisión del historial ni garantiza ausencia absoluta de secretos.

## Alcance y pendientes

La matriz de pedidos utiliza interpretación básica real y transcripciones simuladas. Otras operaciones utilizan intenciones controladas y formularios/API/BD reales: esto prueba su integración, no el reconocimiento de cualquier frase por un proveedor externo. Los ejercicios acústicos son sintéticos, no un micrófono físico ni ruido real. Los tiempos del recorrido incluyen esperas del arnés y no certifican latencia de voz en un VPS.

Cierre ya estaba registrado hoy en QA por la prueba de integración. No se eliminó para repetirlo; su alta quedó validada en backend. La prueba adicional del frontend comprueba el rechazo por voz del cierre duplicado. Se corrigió que el aviso no aparecía en el paso de resumen.

No se encontró una instalación alternativa de reconocimiento en los contenedores, imágenes, archivos del proyecto ni directorios de modelos/descargas inspeccionados. Se conserva exclusivamente Vosk para transcribir. Consumo observado en reposo: aproximadamente 124 MiB, dentro del límite de 512 MiB; no representa una prueba de carga de voz.

La imagen de voz instalada se reutilizó: una reconstrucción desde cero no pudo completar la descarga del modelo. API y frontend sí se construyeron. Queda pendiente comprobar reconstrucción sin caché, VPS/HTTPS y micrófono físico desde celular.

`npm audit --omit=dev` informó 7 paquetes afectados (3 altos y 4 moderados), relacionados con Prisma/deepmerge-ts y MinIO/query-string/stream-json. No se aplicaron degradaciones mayores sugeridas automáticamente. Este resultado funcional no constituye aprobación de seguridad para producción.

Los contenedores del negocio en 8080 no se reiniciaron con estos cambios durante las pruebas. Para aplicarlos, terminar formularios abiertos y seguir [actualización local](PRUEBAS_VOZ_Y_GEMINI.md#usar-la-versión-actual). No eliminar volúmenes.
