# Modelo de datos — AMBIÉ (PostgreSQL)

Base de datos PostgreSQL que reemplaza a `localStorage` como fuente de verdad.
Una sola empresa. Base nueva vacía (no se migran datos comerciales de `ambie:v1:*`).

## Convenciones de nombres

Los nombres de campo son **camelCase** en frontend, API y base de datos. Las tablas
son plurales y camelCase (`clientes`, `pedidos`, `pedidoLineas`). El esquema real vive en
[`Backend/prisma/schema.prisma`](../Backend/prisma/schema.prisma); esta página documenta
el mapeo entre el modelo actual del frontend (`Frontend/src/types/index.ts`) y la base.

- `id`: UUID técnico (Prisma `uuid()`), nunca se expone un código visible como PK/FK.
- Dinero: `numeric(18,2)` (`Decimal` en Prisma; se serializa como cadena decimal en JSON).
- Cantidades: enteros (`Int`).
- `creadoEn`, `actualizadoEn`, `iniciadoEn`, `finalizadoEn`, `fecha`: `timestamptz`.
- `fechaOperacion`, `fechaNacimiento`, `cierresDia.fecha`: `date` local de `America/Bogota`.
- No se borran documentos ni auditoría: se usa `activo`, `estado`, `anuladoEn`, `revertidoEn`.

## Códigos visibles (consecutivos globales, sin huecos)

| Entidad | Campo | Formato |
|---|---|---|
| Usuario | `codigo` | `USR-0001` |
| Cliente | `codigo` | `CLI-0001` |
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
| — | `clientes.codigo` | `CLI-0001`, único |
| `nombre`, `alias`, `telefono`, `ciudad`, `direccion` | iguales | textos |
| `identificacion` | `clientes.identificacion` | nullable; única cuando tiene valor |
| `fechaNacimiento` | `clientes.fechaNacimiento` | `date` |
| `tipoCredito` | `clientes.tipoCreditoId` → `tiposCredito` | `diario|semanal|quincenal|mensual` |
| `estadoCuenta`, `saldoPendiente` | **derivados** | se calculan desde pedidos y aplicaciones |
| `frecuenciaCreditoDias` | derivado de `tiposCredito.frecuenciaCreditoDias` | 1/7/15/30 |
| `ultimoAbonoCreditoEn` | derivado del último `pagos` aplicado | — |
| `ultimoRecordatorioCreditoEn` | `recordatoriosCredito` (si aplica) | — |

### Producto (`Producto`)

| Frontend | Base | Notas |
|---|---|---|
| `id`, `codigoInterno`, `nombre`, `unidad` | iguales | `codigoInterno` único |
| `categoria` | `productos.categoriaId` → `categorias` | catálogo sembrado |
| `precioVenta`, `costoActual` | iguales | `numeric(18,2)` |
| `stock` | **derivado** | `stockFisico` (autoridad) + `stockReservado` + `stockDisponible` |
| `stockMinimo`, `colorEtiqueta`, `activo` | iguales | — |
| `imagenUrl` | `archivosAdjuntos` | URL firmada privada, no Data URL |

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
- `conteosInventario` + `conteoLineas` (`stockFisico`/`diferencia` nulos hasta contar).
- `ajustesInventario` + `ajusteLineas` (`conteoId` nulo = ajuste manual; no existe `"manual"`).
- `cambiosPrecio`: historial de precios.

### Compras y cierres

- `recepcionesCompra` + `recepcionLineas`; incrementan stock físico y actualizan `costoActual`.
- `gastos`; genera egreso de caja.
- `cierresDia` (único por `fecha`) + `cierreMedios`, `cierrePedidos`, `cierreMovimientos`, `cierreAcciones`.

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
- `UNIQUE(pedidoId, productoId)` en `pedidoLineas` y `conteoLineas`.
- `facturas.pedidoId` único: una factura interna por pedido.
- `CHECK cantidad > 0`, `precioUnitario >= 0`, `monto > 0` en caja/pagos.
- FKs `RESTRICT` para entidades con historial; no hay borrado en cascada de negocio.
