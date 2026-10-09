# Carga y sincronización — 30 de septiembre de 2026

Prueba contra Nginx QA `http://localhost:8180/api/v1`, PostgreSQL y volúmenes de `ambie-integracion`. No se insertaron pedidos de prueba en el negocio. API y PostgreSQL limitados a 512 MB/1 CPU cada uno; Docker Desktop/WSL comparte recursos con el equipo y la instalación principal. Las cifras son una muestra local, no la capacidad máxima ni una certificación para 100.000 pedidos.

Comando reproducible, después de `npm run prueba:integracion` para crear usuarios QA:

```bash
npm run prueba:carga
```

| Operación | Solicitudes | Concurrencia | Exitosas / errores | Solicitudes/s | p95 |
|---|---:|---:|---:|---:|---:|
| Crear pedidos, lote 1 | 20 | 5 | 20 / 0 | 15,35 | 373 ms |
| Crear pedidos, lote 2 | 50 | 10 | 50 / 0 | 12,04 | 1963 ms |
| Crear pedidos, lote 3 | 100 | 20 | 100 / 0 | 12,12 | 1889 ms |
| Consultar pedidos como administrador/vendedor | 300 | 30 | 300 / 0 | 117,08 | 362 ms |
| Consultar revisión compartida | 300 | 30 | 300 / 0 | 289,91 | 192 ms |

Los 170 pedidos tienen identificadores y consecutivos únicos. Se consultaron desde ambas sesiones; stock físico 170, reservado 170, ventas y crédito del cliente de prueba $1.700. La venta adicional sin stock fue rechazada y no cambió la reserva. El tablero abierto del administrador pasó de $39.825 a $41.525 y de 32 a 202 pedidos, sin recarga manual, mientras el vendedor escribía por la API. Auditoría mostró sus operaciones y responsable.

La carga concentra pedidos sobre el mismo cliente/producto: sus bloqueos serializan parte del trabajo para evitar sobreventa. No extrapolar esas cifras a todos los negocios o VPS. No se midieron todavía carga sostenida durante horas, 100.000 pedidos históricos, varias instancias API, fallos de disco ni restauración completa.

## Protección antiabuso y número de usuarios

Producción conserva el límite configurable `RATE_LIMIT_MAX=300` por IP y ventana de un minuto por defecto. QA fija 10.000 para separar la medición de persistencia del rechazo HTTP 429. **No se eliminó la protección del negocio.** Una pestaña visible añade unas 30 comprobaciones pequeñas de revisión por minuto, además de consultas y escrituras; varios usuarios detrás de una misma IP comparten el límite. Dimensionar esa variable con la carga real y mantener protección específica de autenticación. Un 429 es una solicitud rechazada, no un pedido guardado.

La sincronización es consulta de revisión cada dos segundos, más latencia y tiempo de recarga. No es push instantáneo. Pausa pestañas ocultas, reanuda al volver y muestra pérdida de conexión. La revisión cambia solo tras commit; Redis no determina la persistencia. No se persisten pedidos offline automáticamente ni se reintenta una escritura incierta de forma ciega.

## Otras verificaciones de esta revisión

- `npm run prueba:integracion`: 17 casos, incluidos permisos, system, reserva, pagos FIFO, cancelación, cierre, archivos y caché.
- `npm run prueba:cache`: reutilización, deduplicación, invalidación y separación de sesiones.
- Navegador: login 320×320 con scroll y sin desbordamiento horizontal; administrador móvil 390×844, escritorio 1440×900 y actualización del tablero con ventas remotas.
