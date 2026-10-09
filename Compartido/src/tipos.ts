/**
 * Tipos de la API (DTOs).
 *
 * Reglas de normalización aplicadas:
 * - Las fechas viajan como texto ISO 8601 (`string`).
 * - Los opcionales ausentes viajan como `null`, nunca `undefined`,
 *   para que el JSON sea estable entre frontend, API y base de datos.
 * - Los montos son números en COP con dos decimales.
 * - Los saldos y estados de cuenta son derivados, nunca duplicados.
 */

import type {
  EstadoCuenta,
  EstadoConteo,
  EstadoFactura,
  EstadoPagoPedido,
  MetodoPago,
  MomentoCobro,
  Periodo,
  RolUsuario,
  TipoConteo,
  TipoMovimientoCaja,
  TipoPago,
  TipoCredito,
} from "./enums";

/** Sobre de toda respuesta de la API. */
export interface Envelope<T> {
  data: T;
}

export interface EnvelopeLista<T> {
  data: T[];
  meta: MetaPaginacion;
}

export interface MetaPaginacion {
  pagina: number;
  porPagina: number;
  total: number;
}

export interface ErrorAPI {
  code: string;
  message: string;
}

export interface AuditoriaEventoDTO {
  id: string;
  entidadTipo: string;
  entidadId: string;
  accion: string;
  usuarioId: string | null;
  usuario: string;
  requestId: string | null;
  creadoEn: string;
  datosAntes: unknown;
  datosDespues: unknown;
}

// ─── Identidad ────────────────────────────────────────────────────

export interface UsuarioDTO {
  /** Identidad protegida del desarrollador, no un rol adicional. */
  esSistema?: boolean;
  id: string;
  codigo: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  permisos: string[];
  activo: boolean;
  creadoEn: string;
  actualizadoEn?: string;
  ultimoAccesoEn: string | null;
}

export interface SesionDTO {
  /** Solo cuando una integración no usa cookies. */
  accessToken?: string;
  refreshToken?: string;
  expiraEn?: string;
  usuario: UsuarioDTO;
}

export interface DashboardResumenDTO {
  rango: { desde: string; hasta: string };
  ventas: number; pedidos: number; ticketPromedio: number;
  gastos: number; compras: number; utilidad: number;
  creditoPendiente: number; creditoPendienteGlobal: number; alertasStock: number;
  serie: Array<{ dia: string; ventas: number; pedidos: number; gastos: number; compras: number; costo: number }>;
  topProductos: Array<{ productoId: string; nombre: string; unidades: number; venta: number; ganancia: number }>;
  topClientes: Array<{ clienteId: string; nombre: string; comprado: number; pedidos: number; ganancia: number }>;
  cache?: { estado: "hit" | "miss"; version: string };
}

export interface BootstrapDTO {
  usuario: UsuarioDTO;
}

// ─── Clientes ─────────────────────────────────────────────────────

export interface ClienteDTO {
  id: string;
  codigo: string;
  nombre: string;
  alias: string;
  identificacion: string | null;
  telefono: string;
  ciudad: string;
  direccion: string;
  fechaNacimiento: string | null;
  /** Nombre del tipo de crédito, no su id. */
  tipoCredito: TipoCredito | null;
  /** Derivado del tipo de crédito. */
  frecuenciaCreditoDias: number | null;
  /** Derivado: hay pedidos con saldo pendiente. */
  estadoCuenta: EstadoCuenta;
  /** Derivado: total de pedidos − abonos aplicados. */
  saldoPendiente: number;
  ultimoRecordatorioCreditoEn: string | null;
  ultimoAbonoCreditoEn: string | null;
  activo: boolean;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface ClienteDetalleDTO extends ClienteDTO {
  pedidos: PedidoSaldoDTO[];
}

export interface PedidoSaldoDTO {
  id: string;
  numero: string;
  fechaOperacion: string;
  total: number;
  saldoPendiente: number;
}

export interface CarteraDTO {
  clienteId: string;
  saldoPendiente: number;
  pedidos: PedidoSaldoDTO[];
}

// ─── Productos ────────────────────────────────────────────────────

export interface ProductoDTO {
  id: string;
  codigoInterno: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioVenta: number;
  costoActual: number;
  /** Disponible para vender: `stockFisico − stockReservado`. */
  stock: number;
  stockFisico: number;
  stockReservado: number;
  stockDisponible: number;
  stockMinimo: number;
  colorEtiqueta: string;
  imagenUrl: string | null;
  activo: boolean;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface CambioPrecioDTO {
  id: string;
  productoId: string;
  valorAnterior: number;
  valorNuevo: number;
  usuarioId: string;
  usuario?: string;
  fecha: string;
}

export interface CategoriaDTO {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

export interface TipoCreditoDTO {
  id: string;
  codigo: string;
  nombre: TipoCredito;
  frecuenciaCreditoDias: number;
  orden: number;
  activo: boolean;
}

// ─── Pedidos ──────────────────────────────────────────────────────

export interface LineaPedidoDTO {
  productoId: string;
  codigoInterno?: string;
  nombre: string;
  unidad?: string;
  cantidad: number;
  precioUnitario: number;
  /** Snapshot del costo al vender: permite calcular la ganancia real. */
  costoUnitario: number;
  subtotal: number;
  orden?: number;
}

export interface PagoPedidoDTO {
  metodo: MetodoPago;
  momentoCobro: MomentoCobro;
  montoRecibido: number;
  saldoPendiente: number;
  estado: EstadoPagoPedido;
  recordatorioWhatsApp: boolean;
}

export interface HistorialEstadoDTO {
  estado: string;
  usuarioId: string;
  usuario?: string;
  fecha: string;
  comentario: string | null;
}

export interface FacturaDTO {
  id: string;
  numero: string;
  pedidoId: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteIdentificacion: string | null;
  clienteDireccion: string | null;
  fechaEmision: string;
  fechaOperacion: string;
  subtotal: number;
  total: number;
  estado: EstadoFactura;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
}

export interface PedidoDTO {
  id: string;
  numero: string;
  clienteId: string | null;
  clienteNombre?: string;
  vendedorId: string;
  vendedor?: string;
  metodo: MetodoPago;
  momentoCobro: MomentoCobro;
  lineas: LineaPedidoDTO[];
  subtotal: number;
  total: number;
  /** Derivado: total − abonos aplicados. */
  saldoPendiente: number;
  montoRecibido: number;
  estado: string;
  facturaNumero: string | null;
  fechaOperacion: string;
  creadoEn: string;
  actualizadoEn?: string;
  historialEstados: HistorialEstadoDTO[];
  comprobantePagoAdjuntoId?: string | null;
}

// ─── Pagos y abonos ───────────────────────────────────────────────

export interface PagoAplicacionDTO {
  pedidoId: string;
  numero: string;
  montoAplicado: number;
  orden: number;
  revertidoEn: string | null;
}

export interface AbonoDTO {
  id: string;
  clienteId: string | null;
  clienteNombre?: string;
  tipo: TipoPago;
  metodo: MetodoPago;
  monto: number;
  usuarioId: string;
  usuario?: string;
  comentario: string | null;
  fechaOperacion: string;
  creadoEn: string;
  estado: string;
  pedidosAfectados: PagoAplicacionDTO[];
}

export interface ResultadoAbonoDTO {
  pago: AbonoDTO;
  saldoRestante: number;
}

// ─── Caja ─────────────────────────────────────────────────────────

export interface MovimientoCajaDTO {
  id: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  metodo: MetodoPago | null;
  usuarioId: string;
  usuario?: string;
  /** Derivado: `pagoId ?? recepcionCompraId ?? gastoId`. */
  referenciaId: string | null;
  origenTipo: "pago" | "recepcion-compra" | "gasto" | "cierre" | null;
  fechaContable: string;
  creadoEn: string;
  esManual: boolean;
}

export interface ResumenCajaDTO {
  ingresos: number;
  egresos: number;
  balance: number;
  creditoPendiente?: number;
}

export interface GananciaPeriodoDTO {
  periodo: Periodo;
  etiqueta: string;
  ingresos: number;
  egresos: number;
  neto: number;
}

// ─── Compras, proveedores y gastos ────────────────────────────────

export interface ProveedorDTO {
  id: string;
  codigo: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface LineaRecepcionDTO {
  productoId: string;
  codigoInterno: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface RecepcionCompraDTO {
  id: string;
  numero: string;
  proveedorId: string;
  proveedorNombre?: string;
  usuarioId: string;
  total: number;
  descontarCaja: boolean;
  estado: string;
  fechaOperacion: string;
  creadoEn: string;
  lineas: LineaRecepcionDTO[];
}

export interface GastoDTO {
  id: string;
  concepto: string;
  monto: number;
  metodo: MetodoPago | null;
  usuarioId: string;
  usuario?: string;
  comentario: string | null;
  estado: string;
  fechaOperacion: string;
  creadoEn: string;
}

// ─── Inventario ───────────────────────────────────────────────────

export interface LineaConteoDTO {
  id: string;
  conteoId: string;
  productoId: string;
  nombre?: string;
  stockTeorico: number;
  /** `null` mientras el producto no se ha contado. */
  stockFisico: number | null;
  diferencia: number | null;
  contadoEn: string | null;
  nombreInicial?: string | null;
  costoUnitarioInicial?: number | null;
}

export interface InventarioInicialDTO {
  conteoId: string;
  aplicadoEn: string;
  productos: number;
  unidadesIniciales: number;
  valorInicial: number;
  unidadesActuales: number;
  valorActualCostoInicial: number;
  diferencias: number;
  pagina: number;
  porPagina: number;
  total: number;
  lineas: Array<{ productoId: string; nombre: string; costoUnitarioInicial: number; stockInicial: number; stockActual: number; movimientoNeto: number; stockEsperado: number; diferencia: number }>;
}

export interface ConteoInventarioDTO {
  id: string;
  tipo: TipoConteo;
  usuarioId: string;
  usuario?: string;
  turno: string;
  iniciadoEn: string;
  finalizadoEn: string | null;
  estado: EstadoConteo;
  lineas: LineaConteoDTO[];
  resumen?: ResumenConteoDTO;
}

export interface ResumenConteoDTO {
  contadas: number;
  sobrantes: number;
  faltantes: number;
  totalDiferencia: number;
}

export interface LineaAjusteDTO {
  id: string;
  productoId: string;
  nombre?: string;
  stockTeorico: number;
  stockFisico: number;
  diferencia: number;
}

export interface AjusteInventarioDTO {
  id: string;
  /** `null` cuando el ajuste fue manual (no proviene de un conteo). */
  conteoId: string | null;
  usuarioId: string;
  usuario?: string;
  motivo: string | null;
  comentario: string | null;
  estado: string;
  creadoEn: string;
  lineas: LineaAjusteDTO[];
}

export interface MovimientoInventarioDTO {
  id: string;
  productoId: string;
  tipo: string;
  cantidad: number;
  deltaStockFisico: number;
  deltaStockReservado: number;
  stockFisicoAntes: number;
  stockFisicoDespues: number;
  stockReservadoAntes: number;
  stockReservadoDespues: number;
  pedidoId: string | null;
  motivo: string | null;
  usuarioId: string | null;
  creadoEn: string;
}

// ─── Cierre del día ───────────────────────────────────────────────

export interface CierreMedioDTO {
  medio: "efectivo" | "billetera";
  esperado: number;
  contado: number;
  diferencia: number;
}

export interface CierrePedidoDTO {
  pedidoId: string;
  numero: string;
  fechaOperacion: string;
  estado: string;
  total: number;
}

export interface CierreDiaDTO {
  id: string;
  fecha: string;
  usuarioId: string;
  usuario?: string;
  totalVentas: number;
  totalIngresos: number;
  totalEgresos: number;
  pedidosCount: number;
  pendientesTrasladados: number;
  pendientesCancelados: number;
  estado: string;
  medios: CierreMedioDTO[];
  creadoEn: string;
  cerradoEn: string | null;
}

export interface CierrePrevisualizacionDTO {
  fecha: string;
  totalVentas: number;
  totalIngresos: number;
  totalEgresos: number;
  balance: number;
  pedidosCount: number;
  efectivoEsperado: number;
  billeteraEsperado: number;
  ventasEfectivo: number;
  ventasBilletera: number;
  ventasCredito: number;
  movimientos: MovimientoCajaDTO[];
  pedidos: CierrePedidoDTO[];
  pendientes: CierrePendienteDTO[];
}

export interface CierrePendienteDTO {
  pedidoId: string;
  numero: string;
  clienteNombre: string;
  total: number;
  saldoPendiente: number;
  estado: string;
  fechaOperacion: string;
  pago: "efectivo" | "billetera" | "credito";
  esDeAyer: boolean;
}

// ─── Tablero ──────────────────────────────────────────────────────

export interface ResumenTableroDTO {
  ventasHoy: number;
  gastosHoy: number;
  comprasHoy: number;
  ticketPromedio: number;
  creditoPendiente: number;
  alertasStock: number;
  pedidosHoy: number;
  pedidosAyer: number;
  topProductos: TopProductoDTO[];
  topClientes: TopClienteDTO[];
}

export interface TopProductoDTO {
  productoId: string;
  nombre: string;
  unidades: number;
  venta: number;
  ganancia: number;
}

export interface TopClienteDTO {
  clienteId: string;
  clienteNombre?: string;
  comprado: number;
  ganancia: number;
  pedidos: number;
}

export interface PuntoSerieDTO {
  /** Etiqueta del tramo: "lun", "ene", "2026". */
  etiqueta: string;
  ventas: number;
  compras: number;
  gastos: number;
  rentabilidad: number;
}

export interface TableroTemporalDTO {
  granularidad: string;
  desde: string;
  hasta: string;
  serie: PuntoSerieDTO[];
  resumen: {
    ventas: number;
    compras: number;
    gastos: number;
    rentabilidad: number;
  };
  topProductos: TopProductoDTO[];
  topClientes: TopClienteDTO[];
}

// ─── Salud ────────────────────────────────────────────────────────

export interface SaludDTO {
  estado: "ok" | "degradado";
  version: string;
  baseDatos: boolean;
  hora: string;
}
