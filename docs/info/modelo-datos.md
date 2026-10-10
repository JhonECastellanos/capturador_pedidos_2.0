# Modelo de datos — AMBIÉ (PostgreSQL)

Base de datos PostgreSQL que reemplaza a `localStorage` como fuente de verdad.
Una sola empresa por instalación. Las instalaciones nuevas empiezan sin operaciones comerciales; las existentes se actualizan mediante migraciones que conservan datos e historial. No se importan datos de `ambie:v1:*` automáticamente.

## Convenciones de nombres

Los nombres de campo son **camelCase** en frontend, API y base de datos. Las tablas
son plurales y camelCase (`clientes`, `pedidos`, `pedidoLineas`). El esquema real vive en
[`Backend/prisma/schema.prisma`](../../Backend/prisma/schema.prisma); esta página documenta
el mapeo entre el modelo actual del frontend (`Frontend/src/types/index.ts`) y la base.

V5P3: consultar el [diccionario de todas las tablas y campos](DICCIONARIO_DATOS_V4P2.md) y el [guardado, reintentos y conciliación SQL](GUARDADO_Y_CONCILIACION_V4P2.md). El inventario inicial reutiliza conteos y ajustes; no introduce otra tabla de stock.

- `id`: UUID técnico (Prisma `uuid()`), nunca se expone un código visible como PK/FK.
- Dinero: `numeric(18,2)` (`Decimal` en Prisma; los DTO de negocio lo convierten a número para la pantalla).
- Cantidades: enteros (`Int`).
- `creadoEn`, `actualizadoEn`, `iniciadoEn`, `finalizadoEn` y eventos `fecha`: `timestamp(3)` sin zona en las migraciones actuales; los servicios usan UTC y representan instantes ISO en la API.
- `fechaOperacion`, `fechaNacimiento`, `cierresDia.fecha`: `date` local de `America/Bogota`.
- No se borran documentos ni auditoría: se usa `activo`, `estado`, `anuladoEn`, `revertidoEn`.

## Códigos visibles (consecutivos globales, sin huecos)

| Entidad | Campo | Formato |
|---|---|---|
| Usuario | `codigo` | `USR-0001` |
| Producto | `codigoInterno` | `PROD-0001` |
| Proveedor | `codigo` | `PRV-0001` |
| Tipo de crédito | `codigo` | `TC-0001` |
| Pedido | `numero` | `PED-0001` |
| Recepción | `numero` | `REC-0001` |
| Factura interna | `numero` | `FAC-0001` |

La asignación ocurre dentro de la misma transacción que inserta la entidad
(`siguienteCodigo` en `Backend/src/common/consecutivos.ts`): bloquea la fila de
`consecutivos` con `FOR UPDATE`; si la transacción falla, el número no se consume.

## Mapeo frontend → base

### Cliente (`Cliente`)

| Frontend | Base | Notas |
|---|---|---|
| `id` | `clientes.id` | UUID |
| `nombre`, `alias`, `telefono`, `ciudad`, `direccion` | iguales | textos |
| `identificacion` | `clientes.identificacion` | nullable; única cuando tiene valor |
| `fechaNacimiento` | `clientes.fechaNacimiento` | `date` |
| `tipoCredito` | `clientes.tipoCreditoId` → `tiposCredito` | `diario|semanal|quincenal|mensual` |
| `estadoCuenta`, `saldoPendiente` | **derivados** | se calculan desde pedidos y aplicaciones |
| `frecuenciaCreditoDias` | derivado de `tiposCredito.frecuenciaCreditoDias` | 1/7/15/30 |
| `ultimoAbonoCreditoEn` | derivado del último `pagos` aplicado | — |
| `ultimoRecordatorioCreditoEn` | No se captura en los flujos actuales | No hay registro de envío de mensajes en la API |

### Producto (`Producto`)

| Frontend | Base | Notas |
|---|---|---|
| `id`, `codigoInterno`, `nombre`, `unidad` | iguales | `codigoInterno` único |
| `categoria` | `productos.categoriaId` → `categorias` | catálogo sembrado |
| `precioVenta`, `costoActual` | iguales | `numeric(18,2)` |
| `stock` | **derivado** | `stockDisponible = stockFisico − stockReservado` |
| `stockMinimo`, `colorEtiqueta`, `activo` | iguales | — |
| `imagenUrl` | `archivosAdjuntos` | ruta API autenticada al objeto privado, no Data URL |

### Pedido (`Pedido`)

| Frontend | Base | Notas |
|---|---|---|
| `id`, `numero` | `pedidos.id`, `pedidos.numero` | `numero` único |
| `clienteId`, `vendedorId` | FK a `clientes`, `usuarios` | — |
| `lineas` | `pedidoLineas` | snapshots de nombre, código, precio y costo |
| `subtotal`, `total` | iguales | hoy `subtotal = total` (sin impuestos ni descuentos) |
| `pago` | **derivado** | `pagos` + `pagoAplicaciones` |
| `estado` | `pedidos.estado` | `pendiente|en-preparacion|entregado|cancelado` |
| `comprobantePagoUrl/Nombre` | `archivosAdjuntos` + `comprobantePagoAdjuntoId` | — |
| `creadoEn` | `pedidos.creadoEn` | **inmutable** |
| — | `pedidos.fechaOperacion` | fecha operativa; se traslada en cierre |
| — | `pedidos.metodo` | `efectivo|billetera|credito` (modalidad pactada) |
| — | `pedidos.momentoCobro` | `inmediato|al-entregar|segun-periodicidad` |
| `historialEstados` | `pedidoEstadoHistorial` | append-only |

### Pago y abono (`PagoPedido`, `AbonoCredito`)

- `pagos`: evento de dinero recibido (`tipo`: `pago-inicial|abono|reembolso`;
  `metodo`: `efectivo|billetera`; **`credito` no es un método de caja**).
- `pagoAplicaciones`: qué pedido reduce cada monto.
- `saldoPendiente(pedido) = total − Σ aplicaciones activas`.
- `AbonoCredito.pedidosAfectados` se reconstruye con `numero` del pedido.
- FIFO por `creadoEn, id`. Un abono mayor a la cartera se rechaza (`PAGO_EXCEDE_CARTERA`).

### Caja (`MovimientoCaja`)

- `movimientosCaja`: `tipo` (`ingreso|egreso`), `monto` positivo, `metodo` nullable,
  FKs tipadas (`pagoId`, `recepcionCompraId`, `gastoId`). El `referenciaId` de la UI
  se deriva de estas columnas. Los reversos son filas compensatorias.

### Inventario

- `reservasStock`: compromiso por línea de pedido (`reservada|consumida|liberada`).
- `movimientosInventario`: ledger append-only con saldos antes/después.
  Tipos: `inicializacion`, `reserva`, `consumo-pedido`, `liberacion-reserva`,
  `recepcion-compra`, `ajuste-conteo`, `ajuste-manual`, `reversion`.
- `conteosInventario` + `conteoLineas` (`stockFisico`/`diferencia` nulos hasta contar). Un cero digitado sí cuenta como capturado.
- Conteo aleatorio diario: `fechaDiaria` identifica el día de Bogotá; cada línea guarda `cicloDiario`, `contadoPorId` y `contadoEn`. Se eligen cinco productos activos distintos, o todo el catálogo cuando tiene menos de cinco. La cobertura avanza al finalizar, sin aplicar ajustes automáticamente. Al completar un ciclo dentro de una jornada, las líneas restantes comienzan el siguiente ciclo sin repetir un producto ese día.
- Una reapertura del diario conserva el mismo documento; un diario de una jornada anterior sin terminar se retoma antes de comenzar otro. Los conteos cancelados no completan cobertura.
- Inventario general: usa el mismo documento, captura por producto, revisión y aplicación que el inicial; mantiene compatibilidad con los conteos parciales existentes. El diario y el inicial requieren todas sus líneas capturadas antes de finalizar.
- `aplicado` se deriva de la existencia de un ajuste; no es otra columna de estado ni una segunda copia del stock.
- Tipo `inicial`: un punto de partida aplicado por instalación; conserva nombre/costo y acumulado del ledger en `conteoLineas`. La confirmación usa los ajustes existentes y no genera gasto ni duplica el stock.
- `ajustesInventario` + `ajusteLineas` (`conteoId` nulo = ajuste manual; no existe `"manual"`).
- `cambiosPrecio`: historial de precios.

### Compras y cierres

- `recepcionesCompra` + `recepcionLineas`; incrementan stock físico y actualizan `costoActual`.
- `gastos`; genera egreso de caja.
- `cierresDia` (único por `fecha`) + `cierreMedios`, `cierreAcciones`.

## Reglas de stock

1. `stockDisponible = stockFisico − stockReservado`.
2. Crear pedido: valida disponibilidad, **reserva** (no descuenta físico).
3. Entregar (o crear con `estadoInicial=entregado`): consume reserva y descuenta físico.
4. Cancelar antes de entregar: libera la reserva.
5. No se puede cancelar un pedido entregado; no se reactivan cancelados (v1).
6. Recepción: incrementa físico y reemplaza costo actual.
7. Conteo/ajuste: solo líneas contadas modifican stock.

## Restricciones destacadas

- `UNIQUE` en `usuarios.email`, `usuarios.codigo`, `clientes.codigo`,
  `productos.codigoInterno`, `pedidos.numero`, `recepcionesCompra.numero`,
  `facturas.numero`, `cierresDia.fecha`, `consecutivos(tipo, periodo)`.
- `UNIQUE(pedidoId, productoId)` en `pedidoLineas`; `UNIQUE(conteoId, productoId)` en `conteoLineas`.
- Un inicio no cancelado mediante índice parcial; un ajuste por conteo mediante clave única nullable y FK; una confirmación por `(usuarioId, clave)` en `escriturasConfirmadas`.
- `facturas.pedidoId` único: una factura interna por pedido.
- `CHECK cantidad > 0`, `precioUnitario >= 0`, `monto > 0` en caja/pagos.
- FKs protegen las entidades relacionadas; algunas líneas dependientes declaran `CASCADE`. La aplicación no ofrece borrado físico de documentos comerciales.

## Organización de tablas vigente

- Maestros: usuarios, roles, permisos, rolPermisos, clientes, tiposCredito, productos, categorias y proveedores.
- Documentos y líneas: pedidos, pedidoLineas, pedidoEstadoHistorial, facturas, pagos, pagoAplicaciones, recepcionesCompra, recepcionLineas, gastos, conteosInventario, conteoLineas, ajustesInventario, ajusteLineas, cambiosPrecio, cierresDia, cierreMedios y cierreAcciones.
- Movimientos y reservas: movimientosInventario, reservasStock y movimientosCaja. Conservan trazabilidad; no reemplazarlos por saldos duplicados.
- Soporte: sesiones, archivosAdjuntos, auditoriaEventos, consecutivos, escriturasConfirmadas y versionesCache. La tabla _prisma_migrations registra migraciones. Total después de actualizar: 36 tablas.

La migración 202610100003 retira recordatoriosCredito, cierrePedidos y cierreMovimientos: estaban vacías tanto en negocio como en QA y no tienen lecturas ni escrituras en los servicios actuales. Conserva cierresDia, cierreMedios y cierreAcciones, que sí guardan los cierres y sus decisiones. Si alguna instalación tiene registros en las tablas retiradas, la migración se detiene sin eliminarlos. No se borra ni se restablece información comercial. La migración 202610100002 retira solo un índice redundante; la unicidad de ajuste por conteo permanece protegida por Prisma y PostgreSQL.
