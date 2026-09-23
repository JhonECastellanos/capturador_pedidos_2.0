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
- `/vendedor` Inicio vendedor (métricas hoy) → `/vendedor/pedido` (cliente→productos con tope stock→entrega→pago, galería swipe) → `/vendedor/pedido/completado` (replace, badge estado)
- `/vendedor/clientes/nuevo` alta rápida
- `/admin` (protegido administrador) `AdminLayout` con header compacto sticky (pills con centrado animado, orden: inicio, pedidos, créditos, inventarios, compras, precios, caja, cierre, usuarios):
  - `/admin` Resumen (KPIs, barras CSS, tops, acceso a Créditos)
  - `/admin/pedidos` HOY (n) | HISTORIAL (n), estado, periodo hoy→todo, filtro fecha separado, export Excel, paginación 20
  - `/admin/creditos` PENDIENTES (n) | HISTORIAL (n), periodo hoy→todo, cobro por cliente, WhatsApp, contador días, paginación 20
  - `/admin/inventario` General/Conteo/Descuadres/Ajustes, galería swipe, paginación 20
  - `/admin/compras` COMPRAS (n) | GASTOS (n), periodo hoy→todo, recepción inline, paginación 20
  - `/admin/precios` edición con margen auditado, paginación 20
  - `/admin/caja` tarjetas ingresos/egresos/balance (fijas) + efectivo/nequi/crédito como filtros del historial (toca para filtrar), periodo hoy→todo, buscador pedido/cliente, colores por medio, paginación 20
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
`id, nombre, alias, identificacion, telefono, ciudad, direccion, estadoCuenta, saldoPendiente, creadoEn, frecuenciaCreditoDias?, ultimoRecordatorioCreditoEn?, ultimoAbonoCreditoEn?` · `NuevoCliente = Omit<Cliente,"id"|"estadoCuenta"|"saldoPendiente"|"creadoEn"|"frecuenciaCreditoDias"|"ultimoRecordatorioCreditoEn"|"ultimoAbonoCreditoEn">` · helper `inicialesDe(nombre)` · frecuencia por defecto 2 días para WhatsApp

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
`ConteoInventario { id, tipo:"general"|"aleatorio", usuarioId, turno, iniciadoEn, finalizadoEn?, lineas, estado:"en-curso"|"confirmado"|"cancelado" }`
`AjusteInventario { id, conteoId ("manual" para ajuste manual), usuarioId, lineas, motivo?, comentario?, creadoEn }` — motivos: pérdida, robo, corrección, reversión compra, vencimiento, donación, error captura, otro

### Precios
`CambioPrecio { id, productoId, valorAnterior, valorNuevo, usuarioId, fecha }`

### Créditos y abonos
`AbonoCreditoParcial { pedidoId, numero, montoAplicado }`
`AbonoCredito { id, clienteId, monto, metodo:"efectivo"|"nequi", usuarioId, pedidosAfectados, comentario?, creadoEn }` — se reparte al pedido más antiguo primero (FIFO), descuenta `saldoPendiente` cliente/pedidos y crea ingreso en caja

### Cierres
`CierreDia { id, fecha (YYYY-MM-DD), usuarioId, totalVentas, totalIngresos, totalEgresos, pedidosCount, pendientesTrasladados, pendientesCancelados, conteoEfectivo?, conteoNequi?, diferenciaEfectivo?, diferenciaNequi?, creadoEn }`

## Repositorios (`src/data/repositorios/`)
Claves `ambie:v1:<dominio>` con `leer<T>`/`guardar<T>` + `limpiarTodo()` (dev reset en `Resumen`):
`clientes, productos, pedidos, caja, usuarios, proveedores, recepciones, gastos, conteos, ajustes, cambiosPrecio, abonos, cierres, consecutivo:PED|PROD|REC, sesion-usuario`

Seed `src/data/semilla.ts` si clave es `null`.

## Fachada (`src/context/OperacionesContext.tsx`)
Estado `clientes, pedidos, inventario, movimientosCaja, usuarios, proveedores, recepciones, gastos, conteos, ajustes, cambiosPrecio, abonos, clienteActivo` y operaciones:
`crearCliente, seleccionarClienteActivo, obtenerCliente, registrarPedido, obtenerPedido, actualizarEstadoPedido, adjuntarComprobante, actualizarImagenProducto, crearProducto, registrarEgresoCaja, crearUsuario, crearProveedor, obtenerProveedor, registrarRecepcion, registrarGasto, iniciarConteo, actualizarConteoLinea, finalizarConteoActivo, cancelarConteoActivo, aplicarAjusteDeConteo, registrarAjusteManual, actualizarPrecioProducto, trasladarPedidoAHoy, registrarAbono, actualizarFrecuenciaCredito, registrarRecordatorioCredito`

Lógica pura en `src/dominio/servicios.ts` (testeable).

## Componentes clave (`src/components/`)
`BarraSuperior, BarraInferior, Boton, Icons, VistaImagenProducto (galería swipe ←/→ con ficha completa), SelectorCantidad (h-11 ≥44px), TarjetaProducto, FilaCarrito, TarjetaAccion, BuscadorInput, SegmentoControl, HojaDetalle, SelectorPeriodo, TablaResponsive, GraficaBarras, GuiaAyuda (bombillo 💡 3-5 pasos), NavegacionAdmin`

## Flujos corregidos
- **Vendedor**: cliente inline → productos con categorías + tope stock + galería swipe → entrega (Entregado / Pendiente por preparar) + cobrar al entregar → pago → `/vendedor/pedido/completado` con `replace:true` y badge estado; lo pendiente por cobrar aparece en Créditos y el admin lo valida en Pedidos (sincroniza por `localStorage`).
- **Login**: solo credenciales en `Acceso` con ojito, redirige por `usuario.rol` (admin→`/admin`, vendedor→`/vendedor`).
- **Admin header**: compacto (`Administrador · Centro de control` en 1 línea) + pills con centrado suave al seleccionar (`scrollIntoView center`), sidebar desktop conserva colores/icons.
- **Guías**: bombillo 💡 al lado de cada título (8 paneles), overlay oscuro, 3-4 pasos, Atrás/Adelante, X roja; subtítulos movidos a la guía para dar espacio.
- **Conteos**: normalizados en paréntesis `HOY (n)`, `COMPRAS (n)`, `General (n alertas)`, etc.
- **Inventario Ajustes**: formulario manual por producto (stock físico grande, motivo, comentario) a un dedo, auditado.
- **Inventario General**: buscador nombre/código/categoría + filtro estado (Todos/Alerta/En stock).
- **Caja**: solo lectura, explicación en el bombillo + filtros hoy→todo; tarjetas Efectivo/Nequi/Crédito filtran el historial (ingreso/balance/egresos no filtran); egresos centralizados en `Compras`.
- **Secuenciado móvil**: Compras (lista ↔ recepción 3 pasos con Volver) y Cierre (Cierre ↔ Historial) muestran una cosa a la vez como el pedido del vendedor; el resto ya usa pestañas/detalle para no hacer scroll.
- **Pedidos**: filtro fecha separado (Desde/Hasta) colapsable + export CSV (Excel) con número, fecha, cliente, estado, pago, total, líneas, vendedor.
- **Cierre**: solo-dinero (sin inventario): efectivo/Nequi esperado vs contado con diferencia, pendientes con `Pasar para mañana` / `Eliminar del día`, confirmar cierre + histórico con periodo y rango fecha estilo pedidos.
- **Créditos**: pendientes agrupados por cliente (total, días mora, frecuencia), detalle con pedidos + formulario abono efectivo/nequi (FIFO + caja), frecuencia personalizable, WhatsApp `wa.me` con recordatorio registrado, historial hoy→todo + buscador + paginación; dashboard enlaza a `/admin/creditos`.
- **Filtros**: opción `hoy` en todos los paneles con temporalidad y `todo` al final a la derecha (pedidos, compras, caja, cierre, créditos).
- **Paginación**: componente `Paginacion` (20 por página) en pedidos, caja, compras, créditos, cierre, inventario y precios para no saturar el frontend.
- **Barrido**: consecutivos inicializados desde semilla (sin colisiones PED/PROD), cancelar pedido revierte stock + cartera + caja (egreso `Reverso`), tope de cantidad por stock en pedido, métricas vendedora solo hoy.

## Verificación tras cada fase
`npm run build && npm run lint` + checklist 390×844 y 1440px: pedido sobrevive refresh, estado auditado, descuadre con responsable, recepción stock+, precio auditado KPIs.

## Cuota imágenes
`src/utils/imagen.ts` comprime a dataURL JPEG 720px 0.8 para localStorage (~5MB).


##paso paso por modulos con diseño movil 

Mapa por módulo
Módulo	Proceso	Cambio aplicado
Vender	Cliente→Productos→Pago→Listo	✓ ya estaba; referencia del sistema
Pedidos	Historial→Detalle→Estado	✓ confirmar cancelación (reversa stock/caja/cartera) + aviso
Créditos	Pendientes→Cliente→Abono	✓ confirmar abono (mueve caja) + aviso
Inventario	Menú 4 procesos	✓ Stock / Conteo guiado / Descuadres / Ajuste manual en pantallas separadas con volver; confirmar cancelar conteo, aplicar ajuste y ajuste manual + avisos
Compras	Proveedor→Productos→Confirmar→Detalle	✓ unificado a componentes compartidos
Precios	Buscar→Revisar→Guardar	✓ Revisar muestra antes→después + margen; guardar pide confirmación + aviso
Caja	Solo lectura + filtros	✓ sin cambios (ya cumple)
Cierre	Conteo→Resumen→Historial	✓ confirmar Eliminar pendiente + avisos (trasladar/eliminar)
Usuarios	Lista→Datos→Confirmar	✓ paso 2 de resumen de acceso + aviso
Dashboard/Resumen	KPIs + accesos	✓ sin cambios (un solo scroll interno)

