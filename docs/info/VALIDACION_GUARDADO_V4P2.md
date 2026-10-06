# Guardado y persistencia — 6 de octubre de 2026

Este documento conserva la primera ejecución de V4P2, anterior a la protección de reintentos y al inventario inicial. Sus tiempos y hallazgos son históricos. La corrección y el funcionamiento actual se explican en [Guardado y conciliación V4P2](GUARDADO_Y_CONCILIACION_V4P2.md); las comprobaciones nuevas se registran en [Validación de los cambios](VALIDACION_CAMBIOS_V4P2.md).

La instalación local de producción se reconstruyó con API, frontend y voz. Antes de renovar los registros comerciales se guardaron dos respaldos privados en `.local/backups/`. La limpieza dejó cero pedidos, productos y clientes; después se cargaron 32 productos, 8 clientes y 8 pedidos ficticios por la API. Se conservaron cuentas, permisos, auditoría, catálogos base y consecutivos. Los archivos antiguos de MinIO y los respaldos se conservan; no se eliminaron volúmenes.

## Qué significa guardar automáticamente

Al confirmar el formulario, la aplicación envía la operación y PostgreSQL confirma la transacción. No hay que guardar nuevamente en la base. El formulario espera la respuesta antes de cerrar; si falla la lectura posterior, avisa que la operación ya se guardó. El dictado y la edición de un borrador siguen requiriendo revisión y confirmación.

## Tiempos medidos

Pruebas actuales sobre QA local, Nginx 8180, API y PostgreSQL separados del negocio. Los servicios comparten recursos con producción y parte de la ejecución coincidió con otros ejercicios y compilaciones. Las cifras describen esa ejecución y no una capacidad máxima.

| Ejercicio | Cantidad | Mediana | p95 | Resultado |
|---|---:|---:|---:|---|
| Respuesta completa al guardar pedidos | 30 | 190,44 ms | 601,39 ms | Los 30 pedidos y sus líneas estaban en PostgreSQL al comprobar la respuesta |
| Observación directa posterior en PostgreSQL | 30 | 485,36 ms | 880,95 ms | Incluye ejecutar Docker y psql; no es el instante exacto de confirmación |
| Lectura del pedido por API después de guardar | 30 | 23,47 ms | 108,94 ms | Totales y cantidades correctos |
| Guardar productos desde otra sesión | 10 | 172,52 ms | 357,09 ms | Operaciones confirmadas |
| Desde respuesta hasta aparición en Inventario | 10 | 1337,60 ms | 1351,51 ms | Sin refrescar ni emitir eventos manuales |
| Desde envío hasta aparición en otra sesión | 10 | 1498,61 ms | 1703,87 ms | Sincronización automática en Chrome |

La presencia en otra pantalla tarda más que la escritura porque la revisión se consulta periódicamente. El tiempo empleado en hablar, corregir o revisar un formulario no forma parte del tiempo de guardado. La agrupación de voz espera 2200 ms sin palabras nuevas antes de interpretar.

La carga adicional confirmó 170 pedidos únicos, con reservas, totales y lectura cruzada correctos. Hubo cero errores de escritura en los tres lotes: 20 pedidos con concurrencia 5 y p95 de 1183 ms; 50 con concurrencia 10 y p95 de 2012 ms; 100 con concurrencia 20 y p95 de 3649 ms. También pasaron 300 lecturas de pedidos y 300 consultas de revisión. Se rechazó la unidad adicional al agotar el stock disponible.

## Problemas encontrados

**Navegación después de un cierre rechazado.** Tras intentar confirmar un cierre duplicado, «abrir inicio» se interpretaba como parte del formulario pendiente. Se corrigió dando prioridad a las órdenes explícitas de navegación, con los permisos del usuario autenticado. La prueba nueva cubre cierre, pedido y cliente pendientes, además del rechazo de acceso a Usuarios para un vendedor.

**Reenvío de una venta: pendiente de corrección.** Dos solicitudes idénticas con la misma cabecera `Idempotency-Key` generaron `PED-0558` y `PED-0559` en QA. Una consulta directa de PostgreSQL confirmó dos pedidos por $2000 y dos pagos por $2000 en total. La API no reconoce esa cabecera. La interfaz bloquea confirmaciones repetidas, pero un reenvío después de perder una respuesta puede registrar dos ventas y dos cobros. El ejercicio reproduce el reenvío, no una caída real de red. No se debe repetir una operación dudosa sin consultar primero el pedido. Hace falta identificar cada intento de guardado y reutilizar su resultado al reenviarlo, dentro de una transacción y con separación por usuario.

## Ejercicios ejecutados

La verificación completa pasó, con advertencias de lint existentes. Pasaron 20 pruebas del asistente, 19 casos de integración de negocio y 2 pruebas de caché. La conexión de voz, tickets de un solo uso, audio sintético y rechazo de origen también pasaron. El recorrido inicial de Chrome comprobó las operaciones administrativas antes de encontrar el fallo de navegación; su resultado parcial se conservó para distinguirlo de la repetición posterior.

La repetición con la corrección aplicada abrió las doce secciones después de rechazar un cierre duplicado, sin escrituras. Completó además los ejercicios del vendedor, con dos escrituras confirmadas: un pedido y un abono; una segunda confirmación no los duplicó. Los paneles y la factura móvil pasaron sus recorridos. Producción volvió a responder sana tras el reinicio final; una sesión autenticada comprobó los 32 productos, 8 clientes y 8 pedidos y la navegación con cierre pendiente. El navegador mostró V4P2 en el acceso.

- Dos clientes intentan comprar simultáneamente la última unidad: solo una venta se acepta.
- Cobro directo y abono general simultáneos: no duplican el dinero aplicado.
- Cancelar un pedido abierto: revierte reservas, cartera y caja; un cancelado no admite cobros.
- Venta ocasional: efectivo y billetera funcionan; crédito sin cliente se rechaza.
- Líneas repetidas y cantidades fraccionarias: se rechazan sin guardar parcialmente.
- Conteo parcial: modifica solo las líneas digitadas y rechaza aplicar dos veces el mismo ajuste.
- Factura con dos productos: conserva cantidades y precios históricos después de cambiar el catálogo y recargar.
- Formularios por voz: revisión, corrección de cantidad y método, retroceso, cancelación y confirmación; comprobación de persistencia después de guardar.
- Paneles: doce módulos, filtros, borradores, scroll y retroceso; móvil 390×844 y poca altura 390×320 y 1440×320.
- Sincronización entre dos sesiones: un producto nuevo aparece en Inventario sin pulsar Actualizar.
- Reenvío idéntico de una venta: expone la falta de protección de la API frente a reintentos.

## Cómo repetir los ejercicios

Con QA levantada y los usuarios de integración preparados:

```powershell
npm.cmd run prueba:integracion
npm.cmd run prueba:persistencia
node Backend/scripts/probar-reintento.cjs
node Backend/scripts/probar-sincronizacion-tiempo.cjs
npm.cmd run prueba:carga
npm.cmd run prueba:asistente:ui
npm.cmd run prueba:paneles
```

Para repetir específicamente la navegación después de un cierre QA ya registrado y completar el recorrido del vendedor:

```powershell
$env:CASO_PRUEBA_VOZ='continuacion'
node Backend/scripts/probar-asistente-flujos-ui.cjs
Remove-Item Env:CASO_PRUEBA_VOZ
```

Los scripts nuevos usan exclusivamente QA. Los resultados detallados se guardan en `.local/pruebas-persistencia/` y las capturas en `.local/pruebas-ui/`, fuera de Git.

## Ejercicios adicionales recomendados

1. Cortar la respuesta de red después de confirmar la venta en PostgreSQL y comprobar el reintento desde el formulario. Repetir con dos pestañas y el mismo identificador de operación cuando se implemente la protección.
2. Reiniciar la API entre confirmación y lectura posterior; comprobar que se muestra el pedido existente sin volver a crearlo.
3. Perder conectividad mientras se edita, volver a conectarse y verificar que el borrador se conserva y se guarda una sola vez al confirmar.
4. Repetir cobros, cancelaciones y última unidad con más usuarios, midiendo errores, p95, stock, reservas, caja y cartera.
5. Restaurar los respaldos en una base aislada y comparar pedidos, pagos, cuentas y archivos. La lectura del índice del respaldo no sustituye esa restauración.
6. Probar micrófono físico y conexión HTTPS desde celular. Los recorridos con transcripciones controladas no acreditan reconocimiento acústico real.

La compilación y las pruebas funcionales no resuelven los avisos existentes de dependencias ni acreditan un despliegue en VPS, DNS o HTTPS. Los resultados históricos de voz siguen en su documento original y no se presentan como pruebas nuevas.
