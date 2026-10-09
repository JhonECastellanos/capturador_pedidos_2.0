# Guardado y persistencia — 6 de octubre de 2026

Este documento conserva la primera ejecución de V4P2, anterior a la protección de reintentos y al inventario inicial. Sus tiempos y hallazgos son históricos. La corrección y el funcionamiento actual se explican en [Guardado y conciliación V4P2](GUARDADO_Y_CONCILIACION_V4P2.md); las comprobaciones nuevas se registran en [Validación de los cambios](VALIDACION_CAMBIOS_V4P2.md).

## Qué significa guardar automáticamente

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

La carga adicional confirmó 170 pedidos únicos, con reservas, totales y lectura cruzada correctos. Hubo cero errores de escritura en los tres lotes: 20 pedidos con concurrencia 5 y p95 de 1183 ms; 50 con concurrencia 10 y p95 de 2012 ms; 100 con concurrencia 20 y p95 de 3649 ms. También pasaron 300 lecturas de pedidos y 300 consultas de revisión. Se rechazó la unidad adicional al agotar el stock disponible.

## Problemas encontrados

**Navegación después de un cierre rechazado.** Tras intentar confirmar un cierre duplicado, «abrir inicio» se interpretaba como parte del formulario pendiente. Se corrigió dando prioridad a las órdenes explícitas de navegación, con los permisos del usuario autenticado. La prueba nueva cubre cierre, pedido y cliente pendientes, además del rechazo de acceso a Usuarios para un vendedor.

**Reenvío de una venta: pendiente de corrección.** Dos solicitudes idénticas con la misma cabecera `Idempotency-Key` generaron `PED-0558` y `PED-0559` en QA. Una consulta directa de PostgreSQL confirmó dos pedidos por $2000 y dos pagos por $2000 en total. La API no reconoce esa cabecera. La interfaz bloquea confirmaciones repetidas, pero un reenvío después de perder una respuesta puede registrar dos ventas y dos cobros. El ejercicio reproduce el reenvío, no una caída real de red. No se debe repetir una operación dudosa sin consultar primero el pedido. Hace falta identificar cada intento de guardado y reutilizar su resultado al reenviarlo, dentro de una transacción y con separación por usuario.

## Ejercicios ejecutados

La repetición con la corrección aplicada abrió las doce secciones después de rechazar un cierre duplicado, sin escrituras. Completó además los ejercicios del vendedor, con dos escrituras confirmadas: un pedido y un abono; una segunda confirmación no los duplicó. Los paneles y la factura móvil pasaron sus recorridos. Producción volvió a responder sana tras el reinicio final; una sesión autenticada comprobó los 32 productos, 8 clientes y 8 pedidos y la navegación con cierre pendiente. El navegador mostró V4P2 en el acceso.

- Dos clientes intentan comprar simultáneamente la última unidad: solo una venta se acepta.
- Cobro directo y abono general simultáneos: no duplican el dinero aplicado.
- Cancelar un pedido abierto: revierte reservas, cartera y caja; un cancelado no admite cobros.
- Venta ocasional: efectivo y billetera funcionan; crédito sin cliente se rechaza.
- Líneas repetidas y cantidades fraccionarias: se rechazan sin guardar parcialmente.
- Conteo parcial: modifica solo las líneas digitadas y rechaza aplicar dos veces el mismo ajuste.
- Factura con dos productos: conserva cantidades y precios históricos después de cambiar el catálogo y recargar.
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
npm.cmd run prueba:paneles
```

Los scripts nuevos usan exclusivamente QA. Los resultados detallados se guardan en `.local/pruebas-persistencia/` y las capturas en `.local/pruebas-ui/`, fuera de Git.

## Ejercicios adicionales recomendados

1. Cortar la respuesta de red después de confirmar la venta en PostgreSQL y comprobar el reintento desde el formulario. Repetir con dos pestañas y el mismo identificador de operación cuando se implemente la protección.
2. Reiniciar la API entre confirmación y lectura posterior; comprobar que se muestra el pedido existente sin volver a crearlo.
3. Perder conectividad mientras se edita, volver a conectarse y verificar que el borrador se conserva y se guarda una sola vez al confirmar.
4. Repetir cobros, cancelaciones y última unidad con más usuarios, midiendo errores, p95, stock, reservas, caja y cartera.
5. Restaurar los respaldos en una base aislada y comparar pedidos, pagos, cuentas y archivos. La lectura del índice del respaldo no sustituye esa restauración.
