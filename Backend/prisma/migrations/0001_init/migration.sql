-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('administrador', 'vendedor');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('efectivo', 'billetera', 'credito');

-- CreateEnum
CREATE TYPE "MomentoCobro" AS ENUM ('inmediato', 'al-entregar', 'segun-periodicidad');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('pendiente', 'en-preparacion', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('al-dia', 'pendiente');

-- CreateEnum
CREATE TYPE "TipoPago" AS ENUM ('pago-inicial', 'abono', 'reembolso');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('activo', 'revertido');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "TipoConteo" AS ENUM ('general', 'aleatorio');

-- CreateEnum
CREATE TYPE "EstadoConteo" AS ENUM ('en-curso', 'confirmado', 'cancelado');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('inicializacion', 'reserva', 'consumo-pedido', 'liberacion-reserva', 'recepcion-compra', 'ajuste-conteo', 'ajuste-manual', 'reversion');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('reservada', 'consumida', 'liberada');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('emitida', 'anulada');

-- CreateEnum
CREATE TYPE "EstadoCierre" AS ENUM ('cerrado', 'reabierto');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "ultimoAccesoEn" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rolPermisos" (
    "rolId" TEXT NOT NULL,
    "permisoId" TEXT NOT NULL,

    CONSTRAINT "rolPermisos_pkey" PRIMARY KEY ("rolId","permisoId")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadoEn" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consecutivos" (
    "tipo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL DEFAULT 'global',
    "prefijo" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL DEFAULT 4,
    "ultimoValor" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consecutivos_pkey" PRIMARY KEY ("tipo","periodo")
);

-- CreateTable
CREATE TABLE "auditoriaEventos" (
    "id" TEXT NOT NULL,
    "entidadTipo" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datosAntes" JSONB,
    "datosDespues" JSONB,
    "usuarioId" TEXT,
    "requestId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoriaEventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiposCredito" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "frecuenciaCreditoDias" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tiposCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "identificacion" TEXT,
    "telefono" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "fechaNacimiento" DATE,
    "tipoCreditoId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordatoriosCredito" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "usuarioId" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'enviado',

    CONSTRAINT "recordatoriosCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoriaId" TEXT,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "precioVenta" DECIMAL(18,2) NOT NULL,
    "costoActual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "stockFisico" INTEGER NOT NULL DEFAULT 0,
    "stockReservado" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "colorEtiqueta" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivosAdjuntos" (
    "id" TEXT NOT NULL,
    "productoId" TEXT,
    "pedidoId" TEXT,
    "pagoId" TEXT,
    "nombre" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" TEXT,
    "usuarioId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),

    CONSTRAINT "archivosAdjuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "momentoCobro" "MomentoCobro" NOT NULL DEFAULT 'al-entregar',
    "estado" "EstadoPedido" NOT NULL DEFAULT 'pendiente',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "fechaOperacion" DATE NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "comprobantePagoAdjuntoId" TEXT,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidoLineas" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "costoUnitario" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pedidoLineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidoEstadoHistorial" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "estado" "EstadoPedido" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comentario" TEXT,

    CONSTRAINT "pedidoEstadoHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "clienteIdentificacion" TEXT,
    "clienteDireccion" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaOperacion" DATE NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'emitida',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoPago" NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "comentario" TEXT,
    "fechaOperacion" DATE NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoPago" NOT NULL DEFAULT 'activo',
    "reversionDePagoId" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagoAplicaciones" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "montoAplicado" DECIMAL(18,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertidoEn" TIMESTAMP(3),
    "reversionDeAplicacionId" TEXT,

    CONSTRAINT "pagoAplicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservasStock" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "pedidoLineaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidadReservada" INTEGER NOT NULL,
    "cantidadConsumida" INTEGER NOT NULL DEFAULT 0,
    "cantidadLiberada" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'reservada',
    "reservadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumidoEn" TIMESTAMP(3),
    "liberadoEn" TIMESTAMP(3),
    "usuarioId" TEXT,

    CONSTRAINT "reservasStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientosInventario" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "deltaStockFisico" INTEGER NOT NULL DEFAULT 0,
    "deltaStockReservado" INTEGER NOT NULL DEFAULT 0,
    "stockFisicoAntes" INTEGER NOT NULL,
    "stockFisicoDespues" INTEGER NOT NULL,
    "stockReservadoAntes" INTEGER NOT NULL DEFAULT 0,
    "stockReservadoDespues" INTEGER NOT NULL DEFAULT 0,
    "pedidoId" TEXT,
    "pedidoLineaId" TEXT,
    "reservaStockId" TEXT,
    "recepcionCompraId" TEXT,
    "conteoId" TEXT,
    "ajusteInventarioId" TEXT,
    "reversionDeMovimientoId" TEXT,
    "motivo" TEXT,
    "comentario" TEXT,
    "usuarioId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientosInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteosInventario" (
    "id" TEXT NOT NULL,
    "tipo" "TipoConteo" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "turno" TEXT NOT NULL,
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEn" TIMESTAMP(3),
    "estado" "EstadoConteo" NOT NULL DEFAULT 'en-curso',

    CONSTRAINT "conteosInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteoLineas" (
    "id" TEXT NOT NULL,
    "conteoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "stockTeorico" INTEGER NOT NULL,
    "stockFisico" INTEGER,
    "diferencia" INTEGER,
    "contadoEn" TIMESTAMP(3),

    CONSTRAINT "conteoLineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustesInventario" (
    "id" TEXT NOT NULL,
    "conteoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "motivo" TEXT,
    "comentario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'aplicado',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustesInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajusteLineas" (
    "id" TEXT NOT NULL,
    "ajusteInventarioId" TEXT NOT NULL,
    "conteoLineaId" TEXT,
    "productoId" TEXT NOT NULL,
    "stockTeorico" INTEGER NOT NULL,
    "stockFisico" INTEGER NOT NULL,
    "diferencia" INTEGER NOT NULL,

    CONSTRAINT "ajusteLineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambiosPrecio" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "valorAnterior" DECIMAL(18,2) NOT NULL,
    "valorNuevo" DECIMAL(18,2) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambiosPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcionesCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "descontarCaja" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'recibida',
    "fechaOperacion" DATE NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepcionesCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcionLineas" (
    "id" TEXT NOT NULL,
    "recepcionCompraId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "recepcionLineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "metodo" "MetodoPago",
    "usuarioId" TEXT NOT NULL,
    "comentario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'registrado',
    "fechaOperacion" DATE NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientosCaja" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "metodo" "MetodoPago",
    "usuarioId" TEXT NOT NULL,
    "pagoId" TEXT,
    "recepcionCompraId" TEXT,
    "gastoId" TEXT,
    "reversionDeMovimientoId" TEXT,
    "fechaContable" DATE NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "esManual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "movimientosCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierresDia" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "totalVentas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalIngresos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalEgresos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pedidosCount" INTEGER NOT NULL DEFAULT 0,
    "pendientesTrasladados" INTEGER NOT NULL DEFAULT 0,
    "pendientesCancelados" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoCierre" NOT NULL DEFAULT 'cerrado',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),

    CONSTRAINT "cierresDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierreMedios" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "esperado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "diferencia" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "cierreMedios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierrePedidos" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaOperacion" DATE NOT NULL,
    "estado" "EstadoPedido" NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "cierrePedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierreMovimientos" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "movimientoCajaId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "metodo" "MetodoPago",
    "monto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "cierreMovimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierreAcciones" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "fechaOperacionAnterior" DATE NOT NULL,
    "fechaOperacionNueva" DATE,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierreAcciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigo_key" ON "usuarios"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tokenHash_key" ON "sesiones"("tokenHash");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- CreateIndex
CREATE INDEX "auditoriaEventos_entidadTipo_entidadId_idx" ON "auditoriaEventos"("entidadTipo", "entidadId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_codigo_key" ON "categorias"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tiposCredito_codigo_key" ON "tiposCredito"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tiposCredito_nombre_key" ON "tiposCredito"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_codigo_key" ON "clientes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_identificacion_key" ON "clientes"("identificacion");

-- CreateIndex
CREATE INDEX "clientes_nombre_idx" ON "clientes"("nombre");

-- CreateIndex
CREATE INDEX "recordatoriosCredito_clienteId_idx" ON "recordatoriosCredito"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigoInterno_key" ON "productos"("codigoInterno");

-- CreateIndex
CREATE INDEX "productos_nombre_idx" ON "productos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_codigo_key" ON "proveedores"("codigo");

-- CreateIndex
CREATE INDEX "proveedores_nombre_idx" ON "proveedores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE INDEX "pedidos_clienteId_idx" ON "pedidos"("clienteId");

-- CreateIndex
CREATE INDEX "pedidos_fechaOperacion_idx" ON "pedidos"("fechaOperacion");

-- CreateIndex
CREATE INDEX "pedidoLineas_pedidoId_idx" ON "pedidoLineas"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidoLineas_pedidoId_productoId_key" ON "pedidoLineas"("pedidoId", "productoId");

-- CreateIndex
CREATE INDEX "pedidoEstadoHistorial_pedidoId_idx" ON "pedidoEstadoHistorial"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_numero_key" ON "facturas"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_pedidoId_key" ON "facturas"("pedidoId");

-- CreateIndex
CREATE INDEX "facturas_clienteId_idx" ON "facturas"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_idempotencyKey_key" ON "pagos"("idempotencyKey");

-- CreateIndex
CREATE INDEX "pagos_clienteId_idx" ON "pagos"("clienteId");

-- CreateIndex
CREATE INDEX "pagoAplicaciones_pagoId_idx" ON "pagoAplicaciones"("pagoId");

-- CreateIndex
CREATE INDEX "pagoAplicaciones_pedidoId_idx" ON "pagoAplicaciones"("pedidoId");

-- CreateIndex
CREATE INDEX "reservasStock_productoId_idx" ON "reservasStock"("productoId");

-- CreateIndex
CREATE INDEX "movimientosInventario_productoId_creadoEn_idx" ON "movimientosInventario"("productoId", "creadoEn");

-- CreateIndex
CREATE INDEX "conteosInventario_estado_idx" ON "conteosInventario"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "conteoLineas_conteoId_productoId_key" ON "conteoLineas"("conteoId", "productoId");

-- CreateIndex
CREATE INDEX "cambiosPrecio_productoId_idx" ON "cambiosPrecio"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "recepcionesCompra_numero_key" ON "recepcionesCompra"("numero");

-- CreateIndex
CREATE INDEX "recepcionesCompra_fechaOperacion_idx" ON "recepcionesCompra"("fechaOperacion");

-- CreateIndex
CREATE INDEX "gastos_fechaOperacion_idx" ON "gastos"("fechaOperacion");

-- CreateIndex
CREATE INDEX "movimientosCaja_fechaContable_idx" ON "movimientosCaja"("fechaContable");

-- CreateIndex
CREATE UNIQUE INDEX "cierresDia_fecha_key" ON "cierresDia"("fecha");

-- AddForeignKey
ALTER TABLE "rolPermisos" ADD CONSTRAINT "rolPermisos_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rolPermisos" ADD CONSTRAINT "rolPermisos_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tipoCreditoId_fkey" FOREIGN KEY ("tipoCreditoId") REFERENCES "tiposCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatoriosCredito" ADD CONSTRAINT "recordatoriosCredito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidoLineas" ADD CONSTRAINT "pedidoLineas_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidoLineas" ADD CONSTRAINT "pedidoLineas_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidoEstadoHistorial" ADD CONSTRAINT "pedidoEstadoHistorial_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidoEstadoHistorial" ADD CONSTRAINT "pedidoEstadoHistorial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagoAplicaciones" ADD CONSTRAINT "pagoAplicaciones_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagoAplicaciones" ADD CONSTRAINT "pagoAplicaciones_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservasStock" ADD CONSTRAINT "reservasStock_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservasStock" ADD CONSTRAINT "reservasStock_pedidoLineaId_fkey" FOREIGN KEY ("pedidoLineaId") REFERENCES "pedidoLineas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservasStock" ADD CONSTRAINT "reservasStock_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientosInventario" ADD CONSTRAINT "movimientosInventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteosInventario" ADD CONSTRAINT "conteosInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteoLineas" ADD CONSTRAINT "conteoLineas_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "conteosInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteoLineas" ADD CONSTRAINT "conteoLineas_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustesInventario" ADD CONSTRAINT "ajustesInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajusteLineas" ADD CONSTRAINT "ajusteLineas_ajusteInventarioId_fkey" FOREIGN KEY ("ajusteInventarioId") REFERENCES "ajustesInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajusteLineas" ADD CONSTRAINT "ajusteLineas_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambiosPrecio" ADD CONSTRAINT "cambiosPrecio_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambiosPrecio" ADD CONSTRAINT "cambiosPrecio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcionesCompra" ADD CONSTRAINT "recepcionesCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcionesCompra" ADD CONSTRAINT "recepcionesCompra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcionLineas" ADD CONSTRAINT "recepcionLineas_recepcionCompraId_fkey" FOREIGN KEY ("recepcionCompraId") REFERENCES "recepcionesCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcionLineas" ADD CONSTRAINT "recepcionLineas_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientosCaja" ADD CONSTRAINT "movimientosCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientosCaja" ADD CONSTRAINT "movimientosCaja_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierresDia" ADD CONSTRAINT "cierresDia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierreMedios" ADD CONSTRAINT "cierreMedios_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "cierresDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierrePedidos" ADD CONSTRAINT "cierrePedidos_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "cierresDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierreMovimientos" ADD CONSTRAINT "cierreMovimientos_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "cierresDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierreAcciones" ADD CONSTRAINT "cierreAcciones_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "cierresDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

