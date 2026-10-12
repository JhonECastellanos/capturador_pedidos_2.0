# Modelo de datos — Synchronic.JO (PostgreSQL)

Base de datos PostgreSQL que reemplaza a `localStorage` como fuente de verdad.
Una sola empresa por instalación. Las instalaciones nuevas empiezan sin operaciones comerciales; las existentes se actualizan mediante migraciones que conservan datos e historial. No se importan datos de `ambie:v1:*` automáticamente.

Salir de un conteo conserva su estado abierto, participantes y líneas guardadas; libera únicamente la asignación del usuario que sale. Cancelarlo definitivamente es exclusivo del administrador: cambia estado/fecha de cierre y libera todas las asignaciones dentro de la misma transacción, sin eliminar cantidades/responsables/fechas ni modificar productos o movimientos de stock. Se reutilizan `conteosInventario`, `conteoLineas` y `participantesConteo`; no requiere tablas nuevas.

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
- `cambiosPrecio`: historial de valores de venta.

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

### Configuración del asistente (V6P4)

`configuracionesAgente` contiene una sola configuración, identificada por `principal`. No agrega empresas ni modifica pedidos, pagos, inventario o caja.

| Campo | Tipo y uso |
|---|---|
| `id` | Texto, clave primaria; el servicio usa `principal`. |
| `configuracion` | JSONB con modo, proveedores sin claves, selección de modelos y ajustes de audio/local/live. Validado con el contrato compartido. |
| `secretos` | Texto cifrado con AES-256-GCM: IV, etiqueta de autenticación y contenido cifrado. Contiene las claves por identificador de proveedor; nunca se devuelve al frontend. |
| `version` | Entero positivo. La actualización exige la versión leída, bajo bloqueo transaccional; devuelve 409 si otro administrador ya guardó. |
| `actualizadoEn` | Fecha de la última modificación, administrada por Prisma. |

La clave privada `AGENT_CONFIG_SECRET` debe mantenerse estable y protegida junto con el respaldo de la instalación. Si está vacía se utiliza el secreto de autenticación del servidor. Cambiarla sin conservar la anterior impide abrir las claves ya guardadas. El DTO público solo indica `tieneClave`.

Una instrucción interpretada permanece como borrador en memoria del navegador. No crea una tabla paralela de ventas ni ejecuta documentos. Al confirmar, utiliza el mismo formulario, endpoint y transacción comercial. La auditoría registra metadatos de las solicitudes, sin audio, cuerpos ni claves.

Consulta de validación sin mostrar secretos:

```sql
SELECT id, version, "actualizadoEn",
       configuracion->>'modo' AS modo,
       configuracion->>'habilitado' AS habilitado
FROM "configuracionesAgente";
```

V6P4: dentro del JSON configuracion, proveedores[].maxTokens guarda el límite de salida por solicitud (256..8192; 2000 predeterminado) y respaldoId conserva el UUID de otra conexión autorizada o null. Los registros anteriores reciben esos valores predeterminados al validar; no se requiere otra tabla ni se modifican documentos comerciales. Las métricas de una interpretación se devuelven en RevisionAgente.conexion sin guardar texto, claves ni una estimación de saldo.


## V7P4 · etiquetas y primera instalación

`productos` conserva su UUID y `codigoInterno` único. `precioPendiente` conserva compatibilidad con productos históricos aún sin parametrizar: permanecen fuera de ventas hasta confirmar su importe en Productos o importar un importe explícito por CSV. Las altas actuales requieren un importe explícito; cero confirmado también es válido. Inventario no da de alta productos.

`codigosProducto` relaciona varias etiquetas con un solo producto. Campos: `id` UUID, `codigo` texto único de hasta 128 caracteres validado por API (incluye ceros iniciales), `productoId` FK restrictiva, `creadoEn` fecha de vinculación y `retiradoEn` fecha opcional de retiro. La API reserva el formato PROD para los consecutivos internos. Un código no puede trasladarse a otro producto. Los códigos retirados se conservan y no se reutilizan; el administrador puede retirarlos cuando dejen de circular. No hay borrado automático por antigüedad.

La lectura acepta códigos de barras y contenido literal de QR, sin abrir enlaces del QR. Busca un alias vigente o el consecutivo exacto. Si el código no existe, Inventario solicita registrarlo en Productos o Compras; no crea productos. Ambas opciones usan la misma ficha con coincidencias por nombre, unidad, costo, precio y mínimo, con cantidad cero; las existencias llegan por una recepción o por aplicación del inicial.

No se añadieron tablas de stock, participantes o historiales duplicadas. Se reutilizan `conteosInventario`, `conteoLineas`, `participantesConteo`, `ajustesInventario` y `movimientosInventario`. Crear un producto mientras el inicial está abierto añade su línea pendiente bajo los mismos bloqueos. Registrar una etiqueta adicional de un producto ya contado conserva la cantidad anterior.

Escanear para contar reserva la línea elegida cinco minutos bajo el bloqueo del conteo. Otro colaborador recibe un conflicto si la línea está ocupada o contada. Guardar usa el PATCH existente, confirma la transacción y libera la reserva antes de abrir la siguiente cámara. Cero es un conteo válido. Cerrar y aplicar siguen siendo decisiones del administrador; el conteo no ajusta stock automáticamente.

El vendedor solo accede a diarios abiertos; el colaborador Inventario solo a iniciales/generales abiertos. Este último consulta nombres, códigos y unidades, con costos y existencias teóricas ocultos para evitar influir en su conteo. El administrador/system conserva historial, responsables, fechas y diferencias. Un diario pendiente anterior se conserva, pero no bloquea la selección de otra jornada; la rotación utiliza las selecciones de jornadas no canceladas hasta cubrir el catálogo y comienza otro ciclo.


### V8P4 · Apariencia y retiro de colaboradores

`configuracionesVisuales`: fila `principal`, JSON validado `configuracion` (fondo, texto, acento, encabezado, textoEncabezado, fuente, portada, imagen pública) y `actualizadoEn`. GET es público y no entrega identidad ni documentos; PUT exige administrador. Su trigger diferido incrementa la revisión de sincronización tras confirmar el guardado. La imagen comprimida tiene hasta 300 KB y admite firmas JPEG/PNG/WebP; no admite SVG aportado por usuarios.

`usuarios.permisosDenegados`: lista de restricciones sobre los permisos disponibles del rol. Se verifican en AuthGuard, además del rol. `usuarios.eliminadoEn`: fecha del retiro lógico; nunca se eliminan sus referencias de conteos. Cada cambio de acceso revoca sesiones y registra metadatos en auditoría. Una restricción en PostgreSQL impide retirar o restringir system. Los correos nuevos se normalizan y se comprueban sin distinguir mayúsculas bajo bloqueo de transacción.

### Presentaciones del producto (ajustes V8P4)
`productos.id` sigue siendo el identificador operativo de cada presentación: pedidos, compras, stock, reservas, conteos y etiquetas apuntan a ese mismo registro. `productoBaseId` vincula una presentación con su producto principal; `extension` identifica la presentación (por ejemplo, 250 ml o paquete de 6). Un principal tiene base nula y puede representar la primera presentación; su extensión es opcional. Una presentación no puede ser principal de otra. El índice único por principal y extensión, sin distinguir mayúsculas, evita duplicaciones; la creación y edición usan el mismo bloqueo transaccional del catálogo.

La API y la vista SQL `identidadesProducto` exponen `rowid = COALESCE(productoBaseId,id)` y `rowid_ext = id`. No se duplican identificadores almacenados. `codigoInterno` mantiene su consecutivo único para cada presentación. Los códigos comerciales están en `codigosProducto`: varias etiquetas pueden apuntar a la misma presentación, pero cada etiqueta solo puede pertenecer a un registro. Retirar una etiqueta conserva su relación histórica e impide lecturas futuras; no elimina inventario.

nombreBase en la API identifica el nombre principal sin el sufijo de presentación. Cambiar el nombre principal actualiza sus presentaciones dentro de la misma transacción. Editar una presentación modifica su extensión. Los nombres, cantidades y valores de venta históricos de `pedidoLineas` permanecen intactos. Cada presentación tiene stock y precio independientes; los informes por producto agrupan por `rowid`, los informes detallados por `rowid_ext`.
