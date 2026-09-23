# Capturador de pedidos — AMBIÉ

Aplicación web para registrar clientes, productos, pedidos, pagos, inventario, caja, compras y usuarios. Persistencia en `localStorage` versionada (`ambie:v1:`); datos sobreviven al refresh y se siembran desde `src/data/semilla.ts`.

## Tecnologías
- React 19 + TypeScript
- Vite + Tailwind CSS 4 + React Router 7
- Almacenamiento local versionado sin backend

## Desarrollo local
```bash
cd Frontend
npm install
npm run dev
npm run build # tsc -b + vite build
npm run lint  # oxlint
```

## Rutas
- `/` Acceso (login solo credenciales + ojito)
- `/vendedor` Inicio vendedor (métricas simples: pedidos hoy, ventas hoy, por cobrar, descuadre de caja) → lista de pedidos de hoy tappable
  - `/vendedor/pedido` Flujo guiado 4 pasos: Cliente → Productos → **Entrega** (Entregado ahora / Pendiente por preparar) → Pago → `/vendedor/pedido/completado` (`replace`, badge de estado)
  - `/vendedor/pedido/:pedidoId` Detalle del pedido **a pantalla completa y compacto** con botones de estado y `Cobrar al entregar`
  - `/vendedor/abonos` Pantalla independiente de abonos (icono de volver), liquida el crédito solo
  - `/vendedor/clientes/nuevo` Alta rápida de **5 campos** (nombre, teléfono, sitio/dirección, fecha de nacimiento, tipo de crédito) → vuelve al inicio con aviso
- `/admin` (protegido administrador) `AdminLayout` con header compacto sticky (pills con centrado animado, orden: inicio, ventas, pedidos, créditos, inventarios, compras, precios, caja, cierre, usuarios):
  - `/admin` Resumen (KPIs, barras CSS, tops, acceso a Créditos)
  - `/admin/ventas` **Módulo de Ventas del administrador**: misma interfaz del vendedor para tomar pedidos y registrar clientes (`/admin/ventas/clientes/nuevo`, `/admin/ventas/completado`)
  - `/admin/pedidos` HOY (n) | HISTORIAL (n), estado, periodo hoy→todo, filtro fecha separado, export Excel, paginación 20; detalle a pantalla completa (`PedidoDetalle`)
  - `/admin/creditos` PENDIENTES (n) | HISTORIAL (n), periodo hoy→todo, cobro por cliente (saldo en rojo → registrar pago → pedidos que debe, tappables al detalle) con scroll general y pie fijo; el HISTORIAL muestra cada abono con las **facturas a crédito abonadas** (tappables) y el total abonado del periodo; paginación 20
  - `/admin/inventario` General/Conteo/Descuadres/Ajustes, galería swipe, paginación 20; el **conteo guiado** registra solo las líneas digitadas, lista el historial completo de conteos y al tocar uno abre su detalle (contados, sobrantes, faltantes y productos contados) ocupando el espacio disponible
  - `/admin/compras` COMPRAS (n) | GASTOS (n), periodo hoy→todo, recepción inline (paso 2 con contenedor propio de scroll y pie fijo "Revisar y confirmar"), paginación 20
  - `/admin/precios` proceso paso a paso: elegir producto → nuevo precio (margen en vivo) → confirmar (antes/después), paginación 20
  - `/admin/caja` pestañas **Movimientos | Ganancias**: en Movimientos las tarjetas compactas **también filtran** (Ingresos, Egresos, Efectivo, Nequi, Crédito; el Balance solo muestra resultado y se colorea verde/rojo según el signo), periodo hoy→todo, buscador pedido/cliente, colores por medio, paginación 20. En **Ganancias** hay tarjeta de ganancia neta (cobrado − compras y gastos) e historial por periodo hoy, ayer, semanal, mensual, año y todo
  - `/admin/cierre` por pasos Cierre | Historial: solo-dinero (efectivo/Nequi esperado vs contado), pendientes con buscador + filtro pago (colores) y `Pasar para mañana`, confirmar cierre + histórico hoy→todo con fecha (fecha local, sin desfase UTC)
  - `/admin/usuarios` crear usuarios con rol y password

Usuarios hardcodeados: `admin@ambie.local / admin123` (administrador) y `vendedor@ambie.local / vendedor123` (vendedor). Login por nombre/email + contraseña, redirige por `usuario.rol`.

## Variables — modelo de dominio (`src/types/index.ts`)

### Enumeraciones
- `MetodoPago = "efectivo" | "nequi" | "credito"`
- `EstadoPedido = "pendiente" | "en-preparacion" | "entregado" | "cancelado"`
- `RolUsuario = "administrador" | "vendedor"`
- `EstadoCuenta = "al-dia" | "pendiente"`

### Cliente
`id, nombre, alias, identificacion, telefono, ciudad, direccion, estadoCuenta, saldoPendiente, creadoEn, fechaNacimiento?, tipoCredito?, frecuenciaCreditoDias?, ultimoRecordatorioCreditoEn?, ultimoAbonoCreditoEn?`
`TipoCredito = "diario" | "semanal" | "quincenal" | "mensual"` · `FRECUENCIA_POR_TIPO_CREDITO` (1/7/15/30 días) · `ETIQUETA_TIPO_CREDITO` · `frecuenciaDeTipoCredito()`
`NuevoCliente { nombre, telefono, direccion, fechaNacimiento?, tipoCredito?, alias?, identificacion?, ciudad? }` — alta de 5 campos; alias/identificación/ciudad se derivan del nombre y la frecuencia nace del tipo de crédito · helper `inicialesDe(nombre)`

### Producto
`id, codigoInterno (PROD-001), nombre, categoria, unidad, precioVenta, costoActual, stock, stockMinimo, colorEtiqueta, imagenUrl?, activo` · `NuevoProducto = Omit<Producto,"id"|"codigoInterno"|"colorEtiqueta"|"activo"|"imagenUrl">`

### Pedido
`LineaPedido { productoId, nombre, cantidad, precioUnitario, subtotal }`
`PagoPedido { metodo, montoRecibido, saldoPendiente, estado, recordatorioWhatsApp }`
`HistorialEstadoPedido { estado, usuarioId, fecha }`
`Pedido { id, numero (PED-0001), clienteId, vendedorId, lineas, subtotal, total, pago, estado, comprobantePagoUrl?, comprobantePagoNombre?, creadoEn, historialEstados }`
`NuevoPedido { clienteId, vendedorId, lineas, total, pago }`

### Caja
`MovimientoCaja { id, tipo:"ingreso"|"egreso", concepto, monto, metodo?, usuarioId?, referenciaId?, creadoEn }`

### Usuario
`UsuarioSistema { id, nombre, email, password?, rol, permisos[], activo }` · `NuevoUsuario = Pick<UsuarioSistema,"nombre"|"email"|"rol"> & { password? }` · `PERMISOS_POR_ROL`

### Proveedores y compras
`Proveedor { id, nombre, telefono?, creadoEn }`
`LineaRecepcion { productoId, nombre, codigoInterno, cantidad, costoUnitario, subtotal }`
`RecepcionCompra { id, numero (REC-), proveedorId, usuarioId, lineas, total, descontarCaja, creadoEn }`
`Gasto { id, concepto, monto, usuarioId, creadoEn }`

### Inventarios y ajustes
`LineaConteo { productoId, nombre, stockTeorico, stockFisico, diferencia }`
`ConteoInventario { id, tipo:"general"|"aleatorio", usuarioId, turno, iniciadoEn, finalizadoEn?, lineas, lineasContadas?, estado:"en-curso"|"confirmado"|"cancelado" }` — `lineasContadas` guarda los productos ya digitados; lo que no se cuenta nunca ajusta el stock
`AjusteInventario { id, conteoId ("manual" para ajuste manual), usuarioId, lineas, motivo?, comentario?, creadoEn }` — motivos: pérdida, robo, corrección, reversión compra, vencimiento, donación, error captura, otro

### Precios
`CambioPrecio { id, productoId, valorAnterior, valorNuevo, usuarioId, fecha }`

### Créditos y abonos
`AbonoCreditoParcial { pedidoId, numero, montoAplicado }`
`AbonoCredito { id, clienteId, monto, metodo:"efectivo"|"nequi", usuarioId, pedidosAfectados, comentario?, creadoEn }` — en abonos generales se reparte al pedido más antiguo primero (FIFO); el cobro al entregar usa `registrarPagoPedido` y aplica el dinero al pedido exacto. En ambos casos descuenta `saldoPendiente` de cliente/pedidos y crea ingreso en caja

### Cierres
`CierreDia { id, fecha (YYYY-MM-DD), usuarioId, totalVentas, totalIngresos, totalEgresos, pedidosCount, pendientesTrasladados, pendientesCancelados, conteoEfectivo?, conteoNequi?, diferenciaEfectivo?, diferenciaNequi?, creadoEn }`

## Repositorios (`src/data/repositorios/`)
Claves `ambie:v1:<dominio>` con `leer<T>`/`guardar<T>` + `limpiarTodo()` (dev reset en `Resumen`):
`clientes, productos, pedidos, caja, usuarios, proveedores, recepciones, gastos, conteos, ajustes, cambiosPrecio, abonos, cierres, consecutivo:PED|PROD|REC, sesion-usuario`

Seed `src/data/semilla.ts` si clave es `null`.

## Fachada (`src/context/OperacionesContext.tsx`)
Estado `clientes, pedidos, inventario, movimientosCaja, usuarios, proveedores, recepciones, gastos, conteos, ajustes, cambiosPrecio, abonos, clienteActivo` y operaciones:
`crearCliente, seleccionarClienteActivo, obtenerCliente, registrarPedido, obtenerPedido, actualizarEstadoPedido, adjuntarComprobante, actualizarImagenProducto, crearProducto, registrarEgresoCaja, crearUsuario, crearProveedor, obtenerProveedor, registrarRecepcion, registrarGasto, iniciarConteo, actualizarConteoLinea, finalizarConteoActivo, cancelarConteoActivo, aplicarAjusteDeConteo, registrarAjusteManual, actualizarPrecioProducto, trasladarPedidoAHoy, registrarAbono, registrarPagoPedido`

Lógica pura en `src/dominio/servicios.ts` (testeable).

## Componentes clave (`src/components/`)
`BarraSuperior, BarraInferior, Boton, Icons, VistaImagenProducto (galería swipe ←/→ con ficha completa), SelectorCantidad (h-11 ≥44px), TarjetaProducto, FilaCarrito, TarjetaAccion, BuscadorInput, SegmentoControl, HojaDetalle, SelectorPeriodo, TablaResponsive, GraficaBarras, Paginacion, ConfirmarAccion (módulo flotante centrado), TiraToast + useAviso, GuiaAyuda (bombillo 💡 3-5 pasos)`
Utilidades sin componente: `src/utils/paginacion.ts` (`POR_PAGINA`, `paginar`, `totalPaginasDe`) — separadas para no romper Fast Refresh.

## Flujos corregidos
- **Módulo compartido de ventas** (`src/modules/ventas/screens/`): `FlujoVenta`, `PedidoCompletado`, `PedidoDetalle` y `Abonos` se reutilizan en vendedor y administrador (rutas en `RutasVentas.tsx`), sin duplicar pantallas.
- **Vendedor**: inicio con métricas simples (pedidos hoy, ventas hoy, por cobrar y descuadre de caja = contado vs caja) → Crear Pedido / Recibir Abono / Crear Cliente; pedidos de hoy tappables al detalle a pantalla completa.
- **Venta guiada (4 pasos)**: cliente → productos (categorías + tope stock) → **entrega** (Entregado ahora / Pendiente por preparar) → pago. El estado de entrega sincroniza con el panel de Pedidos del administrador.
- **Cobrar al entregar**: desde el detalle del pedido el cobro se aplica **solo a ese pedido** (no se reparte en otras deudas del cliente), queda como abono en el historial de créditos y el pie cambia a “Pedido cobrado · $monto” en vez de seguir ofreciendo el botón.
- **Persistencia de estados**: el cambio de estado se guarda en `localStorage` al instante y se refleja en el panel del vendedor (pedidos de hoy), en el módulo de Pedidos del administrador y en los demás módulos que leen pedidos; cancelar reversa stock/caja/cartera y **revivir un pedido cancelado vuelve a aplicar esos efectos**, sin datos inconsistentes.
- **Abonos (pantalla independiente)**: lista de clientes con saldo, atajos "Liquidar todo"/"Mitad", confirmación, aviso y actualización automática del pedido/cartera al liquidar; icono de volver.
- **Alta de cliente (5 campos)**: nombre, teléfono, sitio/dirección, fecha de nacimiento y tipo de crédito; al guardar vuelve al inicio del rol y avisa que ya se puede crear el pedido.
- **Créditos**: el tipo de crédito pactado al crear el cliente define la frecuencia de recordatorio (`frecuenciaCreditoDias`); los abonos parciales no alteran la periodicidad. El recordatorio manual por WhatsApp se retiró de la interfaz.
- **Detalle compacto en todos los módulos**: una sola pantalla sin scroll general; solo la lista interna hace scroll, botones de estado pequeños con scroll horizontal.
- **Avisos (toast)**: `TiraToast` se muestra flotando al centro de la pantalla (no mueve el contenido) y desaparece en ~2 s (`useAviso`); el botón Deshacer sigue disponible cuando aplica.
- **Confirmaciones con diseño propio**: `ConfirmarAccion` es un módulo flotante centrado (nunca diálogos del navegador) y se usa en todas las operaciones críticas: cambio/cancelación de estado, abonos, ajustes de stock, cambios de precio, salir de una recepción de compra y reiniciar datos.
- **Caja**: las tarjetas Ingresos y Egresos también filtran el historial (además de Efectivo, Nequi y Crédito); el Balance se colorea verde si es positivo y rojo si es negativo, y las tarjetas son compactas para dar más espacio al historial.
- **Ganancias**: pestaña propia en Caja con la ganancia neta del periodo (lo cobrado menos compras y gastos) y un historial por periodo (hoy, ayer, semanal, mensual, año y todo) donde cada fila muestra lo que entró, lo que salió y el neto con color.
- **Cambios de estado con confirmación**: en el detalle del pedido, cambiar estado pide confirmar (incluido cancelar, que reversa stock/caja/cartera) y luego avisa con el toast.
- **Detalle del vendedor**: cabecera verde (`BarraSuperior`) en detalle de pedido, abonos y pedido completado; tarjetas con padding lateral y pie fijo de acciones.
- **Login**: solo credenciales en `Acceso` con ojito, redirige por `usuario.rol` (admin→`/admin`, vendedor→`/vendedor`).
- **Admin header**: compacto (`Administrador · Centro de control` en 1 línea) + pills con centrado suave al seleccionar (`scrollIntoView center`), sidebar desktop conserva colores/icons.
- **Guías**: bombillo 💡 al lado de cada título (8 paneles), overlay oscuro, 3-4 pasos, Atrás/Adelante, X roja; subtítulos movidos a la guía para dar espacio.
- **Conteos**: normalizados en paréntesis `HOY (n)`, `COMPRAS (n)`, `General (n alertas)`, etc.
- **Inventario Ajustes**: proceso de 2 pasos a pantalla completa (elegir producto → físico + motivo + comentario) con diferencia en vivo, pie fijo y confirmación; auditado.
- **Inventario Conteo guiado**: solo lo digitado queda contado (`lineasContadas`), el botón Finalizar se habilita cuando no falta ningún producto, el historial lista todos los conteos (general/aleatorio, en curso, confirmados y cancelados) con contados/faltantes/sobrantes y al tocar uno se abre el detalle con los productos contados y la acción de aplicar el ajuste al stock.
- **Inventario General**: buscador nombre/código/categoría + filtro estado (Todos/Alerta/En stock).
- **Caja**: las tarjetas filtran el historial (ingresos/egresos/efectivo/nequi/crédito) y la pestaña Ganancias resume el neto por periodo; egresos centralizados en `Compras`.
- **Secuenciado móvil**: Compras (lista ↔ recepción 3 pasos con Volver) y Cierre (Cierre ↔ Historial) muestran una cosa a la vez como el pedido del vendedor; el resto ya usa pestañas/detalle para no hacer scroll.
- **Pedidos**: filtro fecha separado (Desde/Hasta) colapsable + export CSV (Excel) con número, fecha, cliente, estado, pago, total, líneas, vendedor.
- **Cierre**: solo-dinero (sin inventario): efectivo/Nequi esperado vs contado con diferencia, pendientes con `Pasar para mañana` / `Eliminar del día`, confirmar cierre + histórico con periodo y rango fecha estilo pedidos.
- **Créditos**: pendientes agrupados por cliente (total, días de mora), detalle compacto con scroll general (saldo en rojo → registrar pago con atajos Liquidar todo/Mitad, FIFO + caja → pedidos que debe) y pie fijo con el botón de cobro; historial con facturas abonadas tappables + total del periodo + buscador; dashboard enlaza a `/admin/creditos`.
- **Filtros**: opción `hoy` en todos los paneles con temporalidad y `todo` al final a la derecha (pedidos, compras, caja, cierre, créditos).
- **Paginación**: componente `Paginacion` (20 por página) en pedidos, caja, compras, créditos, cierre, inventario y precios para no saturar el frontend.
- **Barrido**: consecutivos inicializados desde semilla (sin colisiones PED/PROD), cancelar pedido revierte stock + cartera + caja (egreso `Reverso`) y reactivarlo lo vuelve a aplicar, tope de cantidad por stock en pedido, métricas vendedora solo hoy.

## Verificación tras cada fase
`npm run build && npm run lint` + checklist 390×844 y 1440px: pedido sobrevive refresh, estado auditado, descuadre con responsable, recepción stock+, precio auditado KPIs.

## Cuota imágenes
`src/utils/imagen.ts` comprime a dataURL JPEG 720px 0.8 para localStorage (~5MB).


##paso paso por modulos con diseño movil 

Mapa por módulo
Módulo	Proceso	Cambio aplicado
Vender	Cliente→Productos→Pago→Listo	✓ ya estaba; referencia del sistema
Pedidos	Historial→Detalle→Estado	✓ confirmar cancelación (reversa stock/caja/cartera) + aviso
Créditos	Pendientes→Cliente→Abono	✓ saldo en rojo → registrar pago → pedidos que debe (scroll general, pie fijo); historial con facturas abonadas y total del periodo; confirmar abono + aviso
Inventario	Menú 4 procesos	✓ Stock / Conteo guiado (historial completo + detalle por conteo) / Descuadres / Ajuste manual en pantallas separadas con volver; confirmar cancelar conteo, aplicar ajuste y ajuste manual + avisos
Compras	Proveedor→Productos→Confirmar→Detalle	✓ unificado a componentes compartidos
Precios	Elegir producto→Nuevo precio→Confirmar	✓ Proceso de 2 pasos a pantalla completa: margen en vivo y resumen antes→después; guardar audita
Caja	Movimientos + Ganancias	✓ tarjetas compactas que filtran (ingresos/egresos/efectivo/nequi/crédito), balance con color según signo y ganancia neta con historial hoy→todo
Cierre	Conteo→Resumen→Historial	✓ confirmar Eliminar pendiente + avisos (trasladar/eliminar)
Usuarios	Lista→Datos→Confirmar	✓ paso 2 de resumen de acceso + aviso
Dashboard/Resumen	KPIs + accesos	✓ sin cambios (un solo scroll interno)

