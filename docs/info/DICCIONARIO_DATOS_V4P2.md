# Diccionario de tablas y campos — V4P2

Referencia del esquema Prisma y sus migraciones. Cada fila siguiente describe una **columna física**. Los campos de relación de Prisma se enumeran aparte: no son columnas adicionales ni datos repetidos.

Los identificadores String son TEXT en PostgreSQL; Prisma genera UUID para las PK que declaran uuid(). Los importes son numeric(18,2), las cantidades integer, BigInt es bigint y Json es jsonb. DateTime sin @db.Date se guarda actualmente como timestamp(3) sin zona; los servicios escriben instantes UTC y la API los representa en ISO. Los campos @db.Date son días de calendario. No cambiar el tipo de fecha basándose solo en un comentario histórico.

La nulabilidad permite distinguir un dato aún no capturado de cero. Los default y @updatedAt que indica Prisma no siempre son defaults de PostgreSQL: uuid() y @updatedAt los aplica el cliente; SQL directo debe proporcionar esos valores.

## usuarios (Usuario)

Cuentas de acceso. La cuenta system está protegida; passwordHash nunca sale en los DTO.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `email` | String  | No | @unique | Correo de la cuenta; único. |
| `passwordHash` | String  | No | Sin default; lo proporciona el servicio | Hash Argon2 de la contraseña; privado, nunca contraseña en texto. |
| `rol` | RolUsuario  | No | Sin default; lo proporciona el servicio | Rol vigente de la cuenta; la autorización lo consulta en cada petición. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |
| `esSistema` | Boolean  | No | @default(false) | Identifica la cuenta técnica protegida. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `actualizadoEn` | DateTime  | No | @updatedAt | Momento de la última actualización realizada por Prisma; SQL directo debe mantenerlo explícitamente cuando corresponda. |
| `ultimoAccesoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Último acceso registrado; nulo si todavía no existe. |

Relaciones Prisma:

- `sesiones`: Sesion[] (relación inversa; no columna).
- `pedidos`: Pedido[] (relación inversa; no columna).
- `pedidoEstados`: PedidoEstadoHistorial[] (relación inversa; no columna).
- `pagos`: Pago[] (relación inversa; no columna).
- `conteos`: ConteoInventario[] (relación inversa; no columna).
- `ajustes`: AjusteInventario[] (relación inversa; no columna).
- `cambiosPrecio`: CambioPrecio[] (relación inversa; no columna).
- `recepciones`: RecepcionCompra[] (relación inversa; no columna).
- `gastos`: Gasto[] (relación inversa; no columna).
- `movimientosCaja`: MovimientoCaja[] (relación inversa; no columna).
- `cierres`: CierreDia[] (relación inversa; no columna).

## roles (Rol)

Catálogo de roles de la instalación.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `descripcion` | String  | Sí | Sin default; lo proporciona el servicio | Descripción opcional del catálogo. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |

Relaciones Prisma:

- `rolPermisos`: RolPermiso[] (relación inversa; no columna).

## versionesCache (VersionCache)

Revisiones técnicas de dashboard y sincronización; no contienen datos de ventas.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `version` | BigInt  | No | @default(0) | Revisión de la entidad o contador técnico; no es una segunda copia de sus datos. |
| `transaccion` | BigInt  | No | @default(0) | Identificador de la última transacción que incrementó la revisión; evita varios incrementos por el mismo commit. |

## permisos (Permiso)

Catálogo de permisos.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `descripcion` | String  | Sí | Sin default; lo proporciona el servicio | Descripción opcional del catálogo. |

Relaciones Prisma:

- `rolPermisos`: RolPermiso[] (relación inversa; no columna).

## rolPermisos (RolPermiso)

Vincula un rol con sus permisos, sin repetir la misma pareja.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `rolId` | String  | No | Sin default; lo proporciona el servicio | Identificador del rol vinculado. |
| `permisoId` | String  | No | Sin default; lo proporciona el servicio | Identificador del permiso vinculado. |

Relaciones Prisma:

- `rol`: Rol — @relation(fields: [rolId], references: [id], onDelete: Cascade).
- `permiso`: Permiso — @relation(fields: [permisoId], references: [id], onDelete: Cascade).

Claves e índices declarados: `@@id([rolId, permisoId])`.

## sesiones (Sesion)

Sesiones revocables de acceso; almacena el hash del token, no el token.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `tokenHash` | String  | No | @unique | Hash único del token de renovación; no guardar ni publicar el token original. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `expiraEn` | DateTime  | No | Sin default; lo proporciona el servicio | Momento a partir del cual la sesión deja de ser válida. |
| `revocadoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de revocación; nulo mientras no se revoque. |
| `ip` | String  | Sí | Sin default; lo proporciona el servicio | Dirección del acceso registrada por el servidor. |
| `userAgent` | String  | Sí | Sin default; lo proporciona el servicio | Identificación del navegador o cliente. |

Relaciones Prisma:

- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id], onDelete: Cascade).

Claves e índices declarados: `@@index([usuarioId])`.

## consecutivos (Consecutivo)

Numeración centralizada con bloqueo transaccional; la pareja tipo/periodo identifica el contador.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `tipo` | String  | No | Sin default; lo proporciona el servicio | Clase de documento, movimiento o contador; consultar la enumeración o el servicio según la tabla. |
| `periodo` | String  | No | @default("global") | Ámbito del consecutivo; actualmente global. |
| `prefijo` | String  | No | Sin default; lo proporciona el servicio | Prefijo del código visible. |
| `ancho` | Int  | No | @default(4) | Cantidad mínima de dígitos del consecutivo. |
| `ultimoValor` | Int  | No | @default(0) | Último número confirmado; cambia dentro de la transacción del documento. |
| `actualizadoEn` | DateTime  | No | @updatedAt | Momento de la última actualización realizada por Prisma; SQL directo debe mantenerlo explícitamente cuando corresponda. |

Claves e índices declarados: `@@id([tipo, periodo])`.

## auditoriaEventos (AuditoriaEvento)

Metadatos de operaciones. El interceptor actual no guarda cuerpos ni credenciales.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `entidadTipo` | String  | No | Sin default; lo proporciona el servicio | Recurso sobre el que se realizó la operación. |
| `entidadId` | String  | No | Sin default; lo proporciona el servicio | Identificador de la entidad auditada. |
| `accion` | String  | No | Sin default; lo proporciona el servicio | Acción registrada; en auditoría incluye método HTTP y ruta. |
| `datosAntes` | Json  | Sí | Sin default; lo proporciona el servicio | Campo opcional para auditoría histórica; el interceptor actual no guarda el cuerpo previo. |
| `datosDespues` | Json  | Sí | Sin default; lo proporciona el servicio | Campo opcional para auditoría histórica; el interceptor actual no guarda el cuerpo posterior. |
| `usuarioId` | String  | Sí | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `requestId` | String  | Sí | Sin default; lo proporciona el servicio | Identificador de la petición para rastrear el evento. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Claves e índices declarados: `@@index([entidadTipo, entidadId])`.

## escriturasConfirmadas (EscrituraConfirmada)

Confirmación de una escritura por usuario y clave de intento. La respuesta sirve para repetir la confirmación; no crea otra venta, pago, compra ni movimiento.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `clave` | String  | No | Sin default; lo proporciona el servicio | UUID del intento de guardado; junto con usuarioId identifica una sola escritura confirmada. |
| `ruta` | String  | No | Sin default; lo proporciona el servicio | Método y ruta que pertenecen al intento de guardado. |
| `huella` | String  | No | Sin default; lo proporciona el servicio | SHA-256 del cuerpo canónico; permite rechazar una clave usada con datos diferentes sin guardar el cuerpo capturado. |
| `respuesta` | Json  | No | Sin default; lo proporciona el servicio | Envelope confirmado de la operación de negocio, sin credenciales; se devuelve en el reintento. Es un registro técnico privado, no otro documento de negocio. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Claves e índices declarados: `@@id([usuarioId, clave])`.

## categorias (Categoria)

Categorías de productos.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | @unique | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |
| `orden` | Int  | No | @default(0) | Orden visual o secuencia dentro del documento. |

Relaciones Prisma:

- `productos`: Producto[] (relación inversa; no columna).

## tiposCredito (TipoCredito)

Periodicidades de crédito que los clientes pueden seleccionar.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | @unique | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `frecuenciaCreditoDias` | Int  | No | Sin default; lo proporciona el servicio | Intervalo de la periodicidad de crédito. |
| `orden` | Int  | No | @default(0) | Orden visual o secuencia dentro del documento. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |

Relaciones Prisma:

- `clientes`: Cliente[] (relación inversa; no columna).

## clientes (Cliente)

Datos de clientes. Los saldos y el estado de cuenta se calculan, no se duplican aquí.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `alias` | String  | No | Sin default; lo proporciona el servicio | Nombre corto o forma habitual de identificar al cliente. |
| `identificacion` | String  | Sí | @unique | Identificación del cliente; única cuando tiene valor. |
| `telefono` | String  | No | Sin default; lo proporciona el servicio | Teléfono de contacto. |
| `ciudad` | String  | No | Sin default; lo proporciona el servicio | Ciudad del cliente. |
| `direccion` | String  | No | Sin default; lo proporciona el servicio | Dirección del cliente. |
| `fechaNacimiento` | DateTime @db.Date | Sí | Sin default; lo proporciona el servicio | Fecha de calendario del nacimiento, sin hora. |
| `tipoCreditoId` | String  | Sí | Sin default; lo proporciona el servicio | Periodicidad de crédito seleccionada por el cliente. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `actualizadoEn` | DateTime  | No | @updatedAt | Momento de la última actualización realizada por Prisma; SQL directo debe mantenerlo explícitamente cuando corresponda. |

Relaciones Prisma:

- `tipoCredito`: TipoCredito? — @relation(fields: [tipoCreditoId], references: [id]).
- `pedidos`: Pedido[] (relación inversa; no columna).
- `pagos`: Pago[] (relación inversa; no columna).
- `facturas`: Factura[] (relación inversa; no columna).
- `recordatorios`: RecordatorioCredito[] (relación inversa; no columna).

Claves e índices declarados: `@@index([nombre])`.

## recordatoriosCredito (RecordatorioCredito)

Trazabilidad de recordatorios de cartera.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `clienteId` | String  | No | Sin default; lo proporciona el servicio | Cliente relacionado; nulo en ventas ocasionales donde el modelo lo permite. |
| `pedidoId` | String  | Sí | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `usuarioId` | String  | Sí | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `canal` | String  | No | @default("whatsapp") | Canal utilizado para el recordatorio. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `estado` | String  | No | @default("enviado") | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |

Relaciones Prisma:

- `cliente`: Cliente — @relation(fields: [clienteId], references: [id], onDelete: Cascade).

Claves e índices declarados: `@@index([clienteId])`.

## productos (Producto)

Catálogo y saldos físicos/reservados actuales. El stock disponible es la diferencia entre ambos.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigoInterno` | String  | No | @unique | Código visible del producto; las líneas de documentos conservan su valor histórico. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `categoriaId` | String  | Sí | Sin default; lo proporciona el servicio | Categoría del producto; puede quedar sin categoría. |
| `unidad` | String  | No | @default("unidad") | Presentación o unidad del producto; en la venta conserva la presentación histórica. |
| `precioVenta` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Precio vigente del catálogo; el servidor lo usa para calcular la venta. |
| `costoActual` | Decimal @db.Decimal(18, 2) | No | @default(0) | Costo vigente del producto; la recepción lo actualiza. |
| `stockFisico` | Int  | No | @default(0) | Existencias físicas. En conteos es la cantidad digitada, nula mientras no se cuenta. |
| `stockReservado` | Int  | No | @default(0) | Unidades comprometidas en pedidos abiertos. |
| `stockMinimo` | Int  | No | @default(0) | Umbral de alerta; no limita por sí mismo la venta. |
| `colorEtiqueta` | String  | No | Sin default; lo proporciona el servicio | Token visual asignado al producto. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |
| `version` | Int  | No | @default(1) | Revisión de la entidad o contador técnico; no es una segunda copia de sus datos. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `actualizadoEn` | DateTime  | No | @updatedAt | Momento de la última actualización realizada por Prisma; SQL directo debe mantenerlo explícitamente cuando corresponda. |

Relaciones Prisma:

- `categoria`: Categoria? — @relation(fields: [categoriaId], references: [id]).
- `pedidoLineas`: PedidoLinea[] (relación inversa; no columna).
- `recepcionLineas`: RecepcionLinea[] (relación inversa; no columna).
- `conteoLineas`: ConteoLinea[] (relación inversa; no columna).
- `ajusteLineas`: AjusteLinea[] (relación inversa; no columna).
- `cambiosPrecio`: CambioPrecio[] (relación inversa; no columna).
- `movimientosInventario`: MovimientoInventario[] (relación inversa; no columna).
- `reservasStock`: ReservaStock[] (relación inversa; no columna).

Claves e índices declarados: `@@index([nombre])`.

## proveedores (Proveedor)

Catálogo de proveedores.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `codigo` | String  | No | @unique | Código visible único del catálogo o entidad. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `telefono` | String  | Sí | Sin default; lo proporciona el servicio | Teléfono de contacto. |
| `activo` | Boolean  | No | @default(true) | Habilita o deshabilita la entidad sin eliminar su historial. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `actualizadoEn` | DateTime  | No | @updatedAt | Momento de la última actualización realizada por Prisma; SQL directo debe mantenerlo explícitamente cuando corresponda. |

Relaciones Prisma:

- `recepciones`: RecepcionCompra[] (relación inversa; no columna).

Claves e índices declarados: `@@index([nombre])`.

## archivosAdjuntos (ArchivoAdjunto)

Referencias privadas a objetos de MinIO; el contenido binario no está en PostgreSQL.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `productoId` | String  | Sí | Sin default; lo proporciona el servicio | Producto relacionado. |
| `pedidoId` | String  | Sí | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `pagoId` | String  | Sí | Sin default; lo proporciona el servicio | Pago de origen o pago al que pertenece la aplicación. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `mimeType` | String  | No | Sin default; lo proporciona el servicio | Tipo validado del archivo. |
| `storageKey` | String  | No | Sin default; lo proporciona el servicio | Clave privada del objeto en MinIO; no es una URL pública. |
| `tamano` | Int  | No | Sin default; lo proporciona el servicio | Tamaño del archivo en bytes. |
| `sha256` | String  | Sí | Sin default; lo proporciona el servicio | Huella del archivo para su trazabilidad. |
| `usuarioId` | String  | Sí | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `eliminadoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de eliminación lógica del adjunto. |

## pedidos (Pedido)

Cabecera de venta y su fecha operativa. El cobro y el saldo se reconstruyen con pagos y aplicaciones.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `numero` | String  | No | @unique | Consecutivo visible del documento; no es su clave primaria. |
| `clienteId` | String  | Sí | Sin default; lo proporciona el servicio | Cliente relacionado; nulo en ventas ocasionales donde el modelo lo permite. |
| `vendedorId` | String  | No | Sin default; lo proporciona el servicio | Cuenta que registró la venta. |
| `metodo` | MetodoPago  | No | Sin default; lo proporciona el servicio | Modalidad de pago pactada o medio del movimiento; crédito no es dinero recibido en caja. |
| `momentoCobro` | MomentoCobro  | No | @default(AL_ENTREGAR) | Momento acordado para cobrar la venta. |
| `estado` | EstadoPedido  | No | @default(PENDIENTE) | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `subtotal` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Suma de líneas de la cabecera, o cantidad por precio/costo de la línea. |
| `total` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Total confirmado del documento; hoy la venta no agrega impuestos ni descuentos. |
| `fechaOperacion` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha de calendario contable del documento en America/Bogota; puede diferir de su creación. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `actualizadoEn` | DateTime  | No | @updatedAt | Momento de la última actualización realizada por Prisma; SQL directo debe mantenerlo explícitamente cuando corresponda. |
| `version` | Int  | No | @default(1) | Revisión de la entidad o contador técnico; no es una segunda copia de sus datos. |
| `comprobantePagoAdjuntoId` | String  | Sí | Sin default; lo proporciona el servicio | Referencia al comprobante asociado al pedido. |

Relaciones Prisma:

- `cliente`: Cliente? — @relation(fields: [clienteId], references: [id]).
- `vendedor`: Usuario — @relation(fields: [vendedorId], references: [id]).
- `lineas`: PedidoLinea[] (relación inversa; no columna).
- `historial`: PedidoEstadoHistorial[] (relación inversa; no columna).
- `factura`: Factura? (relación inversa; no columna).
- `aplicaciones`: PagoAplicacion[] (relación inversa; no columna).
- `reservas`: ReservaStock[] (relación inversa; no columna).

Claves e índices declarados: `@@index([clienteId])`; `@@index([fechaOperacion])`; `@@index([creadoEn, id])`; `@@index([fechaOperacion, creadoEn, id])`; `@@index([estado, creadoEn, id])`.

## pedidoLineas (PedidoLinea)

Productos vendidos con cantidades y precios/costos históricos. Cambiar el catálogo no modifica estas líneas.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `pedidoId` | String  | No | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `codigoInterno` | String  | No | Sin default; lo proporciona el servicio | Código visible del producto; las líneas de documentos conservan su valor histórico. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `unidad` | String  | No | Sin default; lo proporciona el servicio | Presentación o unidad del producto; en la venta conserva la presentación histórica. |
| `cantidad` | Int  | No | Sin default; lo proporciona el servicio | Unidades de la línea o magnitud del movimiento; en ledger el signo está en deltaStockFisico/deltaStockReservado. |
| `precioUnitario` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Precio histórico de la línea de venta. |
| `costoUnitario` | Decimal @db.Decimal(18, 2) | No | @default(0) | Costo histórico de la venta o recepción. |
| `subtotal` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Suma de líneas de la cabecera, o cantidad por precio/costo de la línea. |
| `orden` | Int  | No | @default(0) | Orden visual o secuencia dentro del documento. |

Relaciones Prisma:

- `pedido`: Pedido — @relation(fields: [pedidoId], references: [id], onDelete: Cascade).
- `producto`: Producto — @relation(fields: [productoId], references: [id]).
- `reservas`: ReservaStock[] (relación inversa; no columna).

Claves e índices declarados: `@@unique([pedidoId, productoId])`; `@@index([pedidoId])`.

## pedidoEstadoHistorial (PedidoEstadoHistorial)

Historial de estados y usuario que los registró.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `pedidoId` | String  | No | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `estado` | EstadoPedido  | No | Sin default; lo proporciona el servicio | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `fecha` | DateTime  | No | @default(now()) | Fecha del evento; en cierresDia es un día de calendario, no un instante. |
| `comentario` | String  | Sí | Sin default; lo proporciona el servicio | Observación opcional de la operación. |

Relaciones Prisma:

- `pedido`: Pedido — @relation(fields: [pedidoId], references: [id], onDelete: Cascade).
- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).

Claves e índices declarados: `@@index([pedidoId])`.

## facturas (Factura)

Factura interna del pedido con identidad del cliente conservada al emitirla. Sus productos se leen de pedidoLineas.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `numero` | String  | No | @unique | Consecutivo visible del documento; no es su clave primaria. |
| `pedidoId` | String  | No | @unique | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `clienteId` | String  | Sí | Sin default; lo proporciona el servicio | Cliente relacionado; nulo en ventas ocasionales donde el modelo lo permite. |
| `clienteNombre` | String  | No | Sin default; lo proporciona el servicio | Nombre conservado al emitir la factura; venta ocasional cuando no hay cliente. |
| `clienteIdentificacion` | String  | Sí | Sin default; lo proporciona el servicio | Identificación conservada al emitir la factura. |
| `clienteDireccion` | String  | Sí | Sin default; lo proporciona el servicio | Dirección conservada al emitir la factura. |
| `fechaEmision` | DateTime  | No | @default(now()) | Momento de emisión de la factura interna. |
| `fechaOperacion` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha de calendario contable del documento en America/Bogota; puede diferir de su creación. |
| `subtotal` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Suma de líneas de la cabecera, o cantidad por precio/costo de la línea. |
| `total` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Total confirmado del documento; hoy la venta no agrega impuestos ni descuentos. |
| `estado` | EstadoFactura  | No | @default(EMITIDA) | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `anuladoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de anulación de la factura. |
| `motivoAnulacion` | String  | Sí | Sin default; lo proporciona el servicio | Razón registrada para anularla. |

Relaciones Prisma:

- `pedido`: Pedido — @relation(fields: [pedidoId], references: [id]).
- `cliente`: Cliente? — @relation(fields: [clienteId], references: [id]).

Claves e índices declarados: `@@index([clienteId])`.

## pagos (Pago)

Dinero recibido o reembolsado. No equivale a otra venta.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `clienteId` | String  | Sí | Sin default; lo proporciona el servicio | Cliente relacionado; nulo en ventas ocasionales donde el modelo lo permite. |
| `tipo` | TipoPago  | No | Sin default; lo proporciona el servicio | Clase de documento, movimiento o contador; consultar la enumeración o el servicio según la tabla. |
| `metodo` | MetodoPago  | No | Sin default; lo proporciona el servicio | Modalidad de pago pactada o medio del movimiento; crédito no es dinero recibido en caja. |
| `monto` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Importe positivo del pago, gasto o movimiento; el tipo indica ingreso/egreso/reembolso. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `comentario` | String  | Sí | Sin default; lo proporciona el servicio | Observación opcional de la operación. |
| `fechaOperacion` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha de calendario contable del documento en America/Bogota; puede diferir de su creación. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `estado` | EstadoPago  | No | @default(ACTIVO) | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `reversionDePagoId` | String  | Sí | Sin default; lo proporciona el servicio | Pago original al que se refiere el reembolso o reversión. |
| `idempotencyKey` | String  | Sí | @unique | Campo legado opcional de pagos; el flujo actual de reintentos se controla en escriturasConfirmadas, no rellenando este campo. |

Relaciones Prisma:

- `cliente`: Cliente? — @relation(fields: [clienteId], references: [id]).
- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).
- `aplicaciones`: PagoAplicacion[] (relación inversa; no columna).
- `movimientosCaja`: MovimientoCaja[] (relación inversa; no columna).

Claves e índices declarados: `@@index([clienteId])`.

## pagoAplicaciones (PagoAplicacion)

Distribución de un pago entre pedidos. Los abonos generales se distribuyen FIFO; los directos se aplican al pedido elegido.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `pagoId` | String  | No | Sin default; lo proporciona el servicio | Pago de origen o pago al que pertenece la aplicación. |
| `pedidoId` | String  | No | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `montoAplicado` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Parte del pago aplicada a este pedido. |
| `orden` | Int  | No | @default(0) | Orden visual o secuencia dentro del documento. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `revertidoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de reversión de la aplicación; nulo mientras está vigente. |
| `reversionDeAplicacionId` | String  | Sí | Sin default; lo proporciona el servicio | Aplicación original a la que compensa esta fila. |

Relaciones Prisma:

- `pago`: Pago — @relation(fields: [pagoId], references: [id], onDelete: Cascade).
- `pedido`: Pedido — @relation(fields: [pedidoId], references: [id]).

Claves e índices declarados: `@@index([pagoId])`; `@@index([pedidoId])`.

## reservasStock (ReservaStock)

Compromisos de inventario por línea de pedido.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `pedidoId` | String  | No | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `pedidoLineaId` | String  | No | Sin default; lo proporciona el servicio | Línea del pedido que originó la reserva o movimiento. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `cantidadReservada` | Int  | No | Sin default; lo proporciona el servicio | Unidades comprometidas al reservar. |
| `cantidadConsumida` | Int  | No | @default(0) | Unidades consumidas; equivale a cantidadReservada cuando estado es consumida, y a cero en los demás estados. |
| `cantidadLiberada` | Int  | No | @default(0) | Unidades liberadas; equivale a cantidadReservada cuando estado es liberada, y a cero en los demás estados. |
| `estado` | EstadoReserva  | No | @default(RESERVADA) | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `reservadoEn` | DateTime  | No | @default(now()) | Momento de reserva. |
| `consumidoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento del consumo de la reserva. |
| `liberadoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de liberación. |
| `usuarioId` | String  | Sí | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |

Relaciones Prisma:

- `pedido`: Pedido — @relation(fields: [pedidoId], references: [id]).
- `pedidoLinea`: PedidoLinea — @relation(fields: [pedidoLineaId], references: [id]).
- `producto`: Producto — @relation(fields: [productoId], references: [id]).

Claves e índices declarados: `@@index([productoId])`.

## movimientosInventario (MovimientoInventario)

Historial de variaciones físicas y reservadas, con origen y saldos antes/después.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `tipo` | TipoMovimientoInventario  | No | Sin default; lo proporciona el servicio | Clase de documento, movimiento o contador; consultar la enumeración o el servicio según la tabla. |
| `cantidad` | Int  | No | Sin default; lo proporciona el servicio | Unidades de la línea o magnitud del movimiento; en ledger el signo está en deltaStockFisico/deltaStockReservado. |
| `deltaStockFisico` | Int  | No | @default(0) | Cambio firmado del físico: positivo entrada, negativo salida, cero sin variación física. |
| `deltaStockReservado` | Int  | No | @default(0) | Cambio firmado de las reservas: positivo compromiso, negativo liberación o consumo. |
| `stockFisicoAntes` | Int  | No | Sin default; lo proporciona el servicio | Físico anterior al movimiento. |
| `stockFisicoDespues` | Int  | No | Sin default; lo proporciona el servicio | Físico posterior al movimiento. |
| `stockReservadoAntes` | Int  | No | @default(0) | Reservado anterior al movimiento. |
| `stockReservadoDespues` | Int  | No | @default(0) | Reservado posterior al movimiento. |
| `pedidoId` | String  | Sí | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `pedidoLineaId` | String  | Sí | Sin default; lo proporciona el servicio | Línea del pedido que originó la reserva o movimiento. |
| `reservaStockId` | String  | Sí | Sin default; lo proporciona el servicio | Reserva que originó el movimiento. |
| `recepcionCompraId` | String  | Sí | Sin default; lo proporciona el servicio | Recepción que originó la línea o movimiento. |
| `conteoId` | String  | Sí | Sin default; lo proporciona el servicio | Conteo relacionado; nulo en ajuste manual. |
| `ajusteInventarioId` | String  | Sí | Sin default; lo proporciona el servicio | Ajuste que originó la línea o movimiento. |
| `reversionDeMovimientoId` | String  | Sí | Sin default; lo proporciona el servicio | Movimiento original compensado por esta fila. |
| `motivo` | String  | Sí | Sin default; lo proporciona el servicio | Razón del movimiento o ajuste. |
| `comentario` | String  | Sí | Sin default; lo proporciona el servicio | Observación opcional de la operación. |
| `usuarioId` | String  | Sí | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Relaciones Prisma:

- `producto`: Producto — @relation(fields: [productoId], references: [id]).

Claves e índices declarados: `@@index([productoId, creadoEn])`.

## conteosInventario (ConteoInventario)

Cabecera del conteo general, aleatorio o inicial. Confirmado significa conteo finalizado; aplicado se comprueba en ajustesInventario.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `tipo` | TipoConteo  | No | Sin default; lo proporciona el servicio | Clase de documento, movimiento o contador; consultar la enumeración o el servicio según la tabla. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `turno` | String  | No | Sin default; lo proporciona el servicio | Turno que identificó el responsable del conteo. |
| `iniciadoEn` | DateTime  | No | @default(now()) | Momento de apertura del conteo. |
| `finalizadoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de finalización o cancelación; no equivale al momento de aplicación. |
| `estado` | EstadoConteo  | No | @default(EN_CURSO) | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |

Relaciones Prisma:

- `lineas`: ConteoLinea[] (relación inversa; no columna).
- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).

Claves e índices declarados: `@@index([estado])`.

## conteoLineas (ConteoLinea)

Una línea por producto del conteo. Los valores nulos distinguen lo todavía no contado; los campos Inicial conservan el punto de partida aplicado.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `conteoId` | String  | No | Sin default; lo proporciona el servicio | Conteo relacionado; nulo en ajuste manual. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `stockTeorico` | Int  | No | Sin default; lo proporciona el servicio | Físico que se tomó como referencia al abrir el conteo o ajuste. |
| `stockFisico` | Int  | Sí | Sin default; lo proporciona el servicio | Existencias físicas. En conteos es la cantidad digitada, nula mientras no se cuenta. |
| `diferencia` | Int  | Sí | Sin default; lo proporciona el servicio | Físico menos teórico; en cierre contado menos esperado. |
| `contadoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento en que se digitó el físico de esta línea. |
| `nombreInicial` | String  | Sí | Sin default; lo proporciona el servicio | Nombre del producto conservado al aplicar el inventario inicial. |
| `costoUnitarioInicial` | Decimal @db.Decimal(18, 2) | Sí | Sin default; lo proporciona el servicio | Costo vigente conservado al aplicar el inicio; no cambia con nuevas compras. |
| `deltaAcumuladoInicial` | BigInt  | Sí | Sin default; lo proporciona el servicio | Suma del delta físico del ledger al aplicar el inicio, incluido su ajuste. Permite obtener movimientos posteriores por diferencia de acumulados, sin depender de timestamps concurrentes. |

Relaciones Prisma:

- `conteo`: ConteoInventario — @relation(fields: [conteoId], references: [id], onDelete: Cascade).
- `producto`: Producto — @relation(fields: [productoId], references: [id]).

Claves e índices declarados: `@@unique([conteoId, productoId])`.

## ajustesInventario (AjusteInventario)

Cabecera de corrección de stock. conteoId nulo corresponde a ajuste manual; un conteo solo puede tener un ajuste.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `conteoId` | String  | Sí | Sin default; lo proporciona el servicio | Conteo relacionado; nulo en ajuste manual. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `motivo` | String  | Sí | Sin default; lo proporciona el servicio | Razón del movimiento o ajuste. |
| `comentario` | String  | Sí | Sin default; lo proporciona el servicio | Observación opcional de la operación. |
| `estado` | String  | No | @default("aplicado") | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Relaciones Prisma:

- `lineas`: AjusteLinea[] (relación inversa; no columna).
- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).

## ajusteLineas (AjusteLinea)

Cantidades teóricas, físicas y diferencia de cada ajuste aplicado.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `ajusteInventarioId` | String  | No | Sin default; lo proporciona el servicio | Ajuste que originó la línea o movimiento. |
| `conteoLineaId` | String  | Sí | Sin default; lo proporciona el servicio | Línea de conteo que originó la línea de ajuste. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `stockTeorico` | Int  | No | Sin default; lo proporciona el servicio | Físico que se tomó como referencia al abrir el conteo o ajuste. |
| `stockFisico` | Int  | No | Sin default; lo proporciona el servicio | Existencias físicas. En conteos es la cantidad digitada, nula mientras no se cuenta. |
| `diferencia` | Int  | No | Sin default; lo proporciona el servicio | Físico menos teórico; en cierre contado menos esperado. |

Relaciones Prisma:

- `ajuste`: AjusteInventario — @relation(fields: [ajusteInventarioId], references: [id], onDelete: Cascade).
- `producto`: Producto — @relation(fields: [productoId], references: [id]).

## cambiosPrecio (CambioPrecio)

Cambios del precio de venta, con valor anterior/nuevo y responsable.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `valorAnterior` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Precio de venta anterior. |
| `valorNuevo` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Precio de venta nuevo. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `fecha` | DateTime  | No | @default(now()) | Fecha del evento; en cierresDia es un día de calendario, no un instante. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Relaciones Prisma:

- `producto`: Producto — @relation(fields: [productoId], references: [id]).
- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).

Claves e índices declarados: `@@index([productoId])`.

## recepcionesCompra (RecepcionCompra)

Cabecera de compra recibida; total es la suma de sus líneas, no el costo del inventario inicial.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `numero` | String  | No | @unique | Consecutivo visible del documento; no es su clave primaria. |
| `proveedorId` | String  | No | Sin default; lo proporciona el servicio | Proveedor de la recepción. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `total` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Total confirmado del documento; hoy la venta no agrega impuestos ni descuentos. |
| `descontarCaja` | Boolean  | No | @default(false) | Indica si la recepción crea egreso de caja; no cambia la entrada de stock. |
| `estado` | String  | No | @default("recibida") | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `fechaOperacion` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha de calendario contable del documento en America/Bogota; puede diferir de su creación. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Relaciones Prisma:

- `proveedor`: Proveedor — @relation(fields: [proveedorId], references: [id]).
- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).
- `lineas`: RecepcionLinea[] (relación inversa; no columna).

Claves e índices declarados: `@@index([fechaOperacion])`.

## recepcionLineas (RecepcionLinea)

Producto recibido con cantidad y costo histórico de esa compra.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `recepcionCompraId` | String  | No | Sin default; lo proporciona el servicio | Recepción que originó la línea o movimiento. |
| `productoId` | String  | No | Sin default; lo proporciona el servicio | Producto relacionado. |
| `codigoInterno` | String  | No | Sin default; lo proporciona el servicio | Código visible del producto; las líneas de documentos conservan su valor histórico. |
| `nombre` | String  | No | Sin default; lo proporciona el servicio | Nombre mostrado; en líneas de documentos es el nombre conservado al registrarlos. |
| `cantidad` | Int  | No | Sin default; lo proporciona el servicio | Unidades de la línea o magnitud del movimiento; en ledger el signo está en deltaStockFisico/deltaStockReservado. |
| `costoUnitario` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Costo histórico de la venta o recepción. |
| `subtotal` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Suma de líneas de la cabecera, o cantidad por precio/costo de la línea. |

Relaciones Prisma:

- `recepcion`: RecepcionCompra — @relation(fields: [recepcionCompraId], references: [id], onDelete: Cascade).
- `producto`: Producto — @relation(fields: [productoId], references: [id]).

## gastos (Gasto)

Gastos registrados y su fecha operativa; generan un egreso de caja en la transacción.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `concepto` | String  | No | Sin default; lo proporciona el servicio | Descripción del gasto o movimiento de dinero. |
| `monto` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Importe positivo del pago, gasto o movimiento; el tipo indica ingreso/egreso/reembolso. |
| `metodo` | MetodoPago  | Sí | Sin default; lo proporciona el servicio | Modalidad de pago pactada o medio del movimiento; crédito no es dinero recibido en caja. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `comentario` | String  | Sí | Sin default; lo proporciona el servicio | Observación opcional de la operación. |
| `estado` | String  | No | @default("registrado") | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `fechaOperacion` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha de calendario contable del documento en America/Bogota; puede diferir de su creación. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Relaciones Prisma:

- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).

Claves e índices declarados: `@@index([fechaOperacion])`.

## movimientosCaja (MovimientoCaja)

Entradas y salidas de dinero. Los reversos son movimientos compensatorios; no se suman las ventas como si fueran otros ingresos.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `tipo` | TipoMovimientoCaja  | No | Sin default; lo proporciona el servicio | Clase de documento, movimiento o contador; consultar la enumeración o el servicio según la tabla. |
| `concepto` | String  | No | Sin default; lo proporciona el servicio | Descripción del gasto o movimiento de dinero. |
| `monto` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Importe positivo del pago, gasto o movimiento; el tipo indica ingreso/egreso/reembolso. |
| `metodo` | MetodoPago  | Sí | Sin default; lo proporciona el servicio | Modalidad de pago pactada o medio del movimiento; crédito no es dinero recibido en caja. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `pagoId` | String  | Sí | Sin default; lo proporciona el servicio | Pago de origen o pago al que pertenece la aplicación. |
| `recepcionCompraId` | String  | Sí | Sin default; lo proporciona el servicio | Recepción que originó la línea o movimiento. |
| `gastoId` | String  | Sí | Sin default; lo proporciona el servicio | Gasto que originó el egreso de caja. |
| `reversionDeMovimientoId` | String  | Sí | Sin default; lo proporciona el servicio | Movimiento original compensado por esta fila. |
| `fechaContable` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Día de calendario al que pertenece el movimiento de caja. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `esManual` | Boolean  | No | @default(false) | Distingue un movimiento digitado en caja de uno generado por venta/compra/gasto. |

Relaciones Prisma:

- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).
- `pago`: Pago? — @relation(fields: [pagoId], references: [id]).

Claves e índices declarados: `@@index([fechaContable])`.

## cierresDia (CierreDia)

Un cierre por fecha, con los totales del momento de cierre.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `fecha` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha del evento; en cierresDia es un día de calendario, no un instante. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `totalVentas` | Decimal @db.Decimal(18, 2) | No | @default(0) | Ventas incluidas en el snapshot del cierre. |
| `totalIngresos` | Decimal @db.Decimal(18, 2) | No | @default(0) | Ingresos de caja incluidos en el cierre. |
| `totalEgresos` | Decimal @db.Decimal(18, 2) | No | @default(0) | Egresos de caja incluidos en el cierre. |
| `pedidosCount` | Int  | No | @default(0) | Cantidad de pedidos incluidos en el cierre. |
| `pendientesTrasladados` | Int  | No | @default(0) | Cantidad de pedidos pendientes trasladados al siguiente día. |
| `pendientesCancelados` | Int  | No | @default(0) | Cantidad de pedidos cancelados en el cierre. |
| `estado` | EstadoCierre  | No | @default(CERRADO) | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `version` | Int  | No | @default(1) | Revisión de la entidad o contador técnico; no es una segunda copia de sus datos. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |
| `cerradoEn` | DateTime  | Sí | Sin default; lo proporciona el servicio | Momento de confirmación del cierre. |

Relaciones Prisma:

- `usuario`: Usuario — @relation(fields: [usuarioId], references: [id]).
- `medios`: CierreMedio[] (relación inversa; no columna).
- `pedidos`: CierrePedido[] (relación inversa; no columna).
- `movimientos`: CierreMovimiento[] (relación inversa; no columna).
- `acciones`: CierreAccion[] (relación inversa; no columna).

Claves e índices declarados: `@@unique([fecha])`.

## cierreMedios (CierreMedio)

Dinero esperado y contado por medio del cierre.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `cierreId` | String  | No | Sin default; lo proporciona el servicio | Cierre al que pertenece la línea o snapshot. |
| `medio` | String  | No | Sin default; lo proporciona el servicio | Medio de dinero conciliado en el cierre. |
| `esperado` | Decimal @db.Decimal(18, 2) | No | @default(0) | Importe calculado según los movimientos del cierre. |
| `contado` | Decimal @db.Decimal(18, 2) | No | @default(0) | Importe digitado al cerrar. |
| `diferencia` | Decimal @db.Decimal(18, 2) | No | @default(0) | Físico menos teórico; en cierre contado menos esperado. |

Relaciones Prisma:

- `cierre`: CierreDia — @relation(fields: [cierreId], references: [id], onDelete: Cascade).

## cierrePedidos (CierrePedido)

Snapshot de pedidos incluidos en el cierre.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `cierreId` | String  | No | Sin default; lo proporciona el servicio | Cierre al que pertenece la línea o snapshot. |
| `pedidoId` | String  | No | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `numero` | String  | No | Sin default; lo proporciona el servicio | Consecutivo visible del documento; no es su clave primaria. |
| `fechaOperacion` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Fecha de calendario contable del documento en America/Bogota; puede diferir de su creación. |
| `estado` | EstadoPedido  | No | Sin default; lo proporciona el servicio | Estado del documento o evento; confirmar/aplicar un conteo son pasos diferentes. |
| `total` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Total confirmado del documento; hoy la venta no agrega impuestos ni descuentos. |

Relaciones Prisma:

- `cierre`: CierreDia — @relation(fields: [cierreId], references: [id], onDelete: Cascade).

## cierreMovimientos (CierreMovimiento)

Snapshot de movimientos de caja incluidos en el cierre.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `cierreId` | String  | No | Sin default; lo proporciona el servicio | Cierre al que pertenece la línea o snapshot. |
| `movimientoCajaId` | String  | No | Sin default; lo proporciona el servicio | Movimiento de caja incluido en el snapshot del cierre. |
| `tipo` | TipoMovimientoCaja  | No | Sin default; lo proporciona el servicio | Clase de documento, movimiento o contador; consultar la enumeración o el servicio según la tabla. |
| `metodo` | MetodoPago  | Sí | Sin default; lo proporciona el servicio | Modalidad de pago pactada o medio del movimiento; crédito no es dinero recibido en caja. |
| `monto` | Decimal @db.Decimal(18, 2) | No | Sin default; lo proporciona el servicio | Importe positivo del pago, gasto o movimiento; el tipo indica ingreso/egreso/reembolso. |

Relaciones Prisma:

- `cierre`: CierreDia — @relation(fields: [cierreId], references: [id], onDelete: Cascade).

## cierreAcciones (CierreAccion)

Pedidos trasladados o cancelados en el cierre, con sus fechas anteriores y nuevas.

| Columna | Tipo Prisma / almacenamiento especial | Nulo | Generación y restricciones | Significado |
|---|---|---|---|---|
| `id` | String  | No | @id @default(uuid()) | Identificador técnico; UUID generado por Prisma salvo identificadores técnicos definidos por el servicio. |
| `cierreId` | String  | No | Sin default; lo proporciona el servicio | Cierre al que pertenece la línea o snapshot. |
| `pedidoId` | String  | No | Sin default; lo proporciona el servicio | Pedido relacionado; en tablas de trazabilidad sin FK declarada solo identifica su origen. |
| `accion` | String  | No | Sin default; lo proporciona el servicio | Acción registrada; en auditoría incluye método HTTP y ruta. |
| `fechaOperacionAnterior` | DateTime @db.Date | No | Sin default; lo proporciona el servicio | Día operativo del pedido antes de la acción del cierre. |
| `fechaOperacionNueva` | DateTime @db.Date | Sí | Sin default; lo proporciona el servicio | Nuevo día operativo; nulo cuando la acción no trasladó el pedido. |
| `usuarioId` | String  | No | Sin default; lo proporciona el servicio | Cuenta responsable; cuando no hay relación Prisma declarada funciona como referencia de trazabilidad. |
| `creadoEn` | DateTime  | No | @default(now()) | Momento de inserción; normalmente lo fija PostgreSQL. |

Relaciones Prisma:

- `cierre`: CierreDia — @relation(fields: [cierreId], references: [id], onDelete: Cascade).

## Restricciones adicionales de las migraciones

- Cuenta system: protección en PostgreSQL además de API y pantalla.
- Conteo inicial: índice parcial único sobre tipo cuando tipo=inicial y estado distinto de cancelado.
- Ajuste de conteo: índice parcial único sobre conteoId no nulo; los ajustes manuales pueden tener conteoId nulo.
- escriturasConfirmadas.usuarioId tiene FK a usuarios, aunque la relación no se usa para cargar el documento.
- Triggers diferidos incrementan las revisiones de dashboard/sincronización una vez por transacción confirmada. Las escriturasConfirmadas son confirmaciones técnicas y no llevan trigger de datos operativos. Reenviar no cambia la revisión.
- El CHECK reservasStock_cantidades_estado_coherentes mantiene estado y cantidades de reserva consistentes. La migración V4P2 corrige los contadores históricos sin modificar el stock.
- Las migraciones iniciales agregan checks monetarios/de stock y las FKs. Las relaciones con onDelete:Cascade afectan líneas dependientes; la aplicación no ofrece borrado físico de documentos comerciales.

Consulta el [flujo de guardado y las comprobaciones SQL](GUARDADO_Y_CONCILIACION_V4P2.md) antes de comparar saldos, stock o dinero.
