/**
 * Modelo de dominio único de la aplicación.
 * Toda la app importa desde aquí; los tipos por módulo son shims de compatibilidad.
 */

// ─── Enumeraciones ────────────────────────────────────────────────

export type MetodoPago = "efectivo" | "nequi" | "credito";
export type EstadoPedido = "pendiente" | "en-preparacion" | "entregado" | "cancelado";
export type RolUsuario = "administrador" | "vendedor";
export type EstadoCuenta = "al-dia" | "pendiente";

// ─── Clientes ─────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  nombre: string;
  alias: string;
  identificacion: string;
  telefono: string;
  ciudad: string;
  direccion: string;
  estadoCuenta: EstadoCuenta;
  saldoPendiente: number;
  creadoEn: string;
  /** Cada cuántos días recordar la deuda por WhatsApp (personalizable, por defecto 2) */
  frecuenciaCreditoDias?: number;
  ultimoRecordatorioCreditoEn?: string;
  ultimoAbonoCreditoEn?: string;
}

/** Datos del formulario de alta rápida de cliente. */
export type NuevoCliente = Omit<Cliente, "id" | "estadoCuenta" | "saldoPendiente" | "creadoEn" | "frecuenciaCreditoDias" | "ultimoRecordatorioCreditoEn" | "ultimoAbonoCreditoEn">;

// ─── Créditos y abonos ────────────────────────────────────────────

export interface AbonoCreditoParcial {
  pedidoId: string;
  numero: string;
  montoAplicado: number;
}

export interface AbonoCredito {
  id: string;
  clienteId: string;
  monto: number;
  metodo: "efectivo" | "nequi";
  usuarioId: string;
  pedidosAfectados: AbonoCreditoParcial[];
  comentario?: string;
  creadoEn: string;
}

export function inicialesDe(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? "")
    .join("")
    .toUpperCase();
}

// ─── Productos ────────────────────────────────────────────────────

export interface Producto {
  id: string;
  /** Código interno propio del negocio (PROD-001). */
  codigoInterno: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioVenta: number;
  /** Último costo de compra conocido. */
  costoActual: number;
  stock: number;
  stockMinimo: number;
  colorEtiqueta: string;
  imagenUrl?: string;
  activo: boolean;
}

export type NuevoProducto = Omit<Producto, "id" | "codigoInterno" | "colorEtiqueta" | "activo" | "imagenUrl">;

// ─── Pedidos ──────────────────────────────────────────────────────

export interface LineaPedido {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PagoPedido {
  metodo: MetodoPago;
  montoRecibido: number;
  saldoPendiente: number;
  estado: "pagado" | "pendiente";
  recordatorioWhatsApp: boolean;
}

export interface HistorialEstadoPedido {
  estado: EstadoPedido;
  usuarioId: string;
  fecha: string;
}

export interface Pedido {
  id: string;
  numero: string;
  clienteId: string;
  vendedorId: string;
  lineas: LineaPedido[];
  subtotal: number;
  total: number;
  pago: PagoPedido;
  estado: EstadoPedido;
  comprobantePagoUrl?: string;
  comprobantePagoNombre?: string;
  creadoEn: string;
  historialEstados: HistorialEstadoPedido[];
}

export interface NuevoPedido {
  clienteId: string;
  vendedorId: string;
  lineas: LineaPedido[];
  total: number;
  pago: PagoPedido;
  /** Estado inicial (la vendedora indica si ya entregó o queda por preparar). Por defecto "pendiente". */
  estadoInicial?: EstadoPedido;
}

// ─── Caja ─────────────────────────────────────────────────────────

export interface MovimientoCaja {
  id: string;
  tipo: "ingreso" | "egreso";
  concepto: string;
  monto: number;
  metodo?: MetodoPago;
  usuarioId?: string;
  /** Entidad de origen (pedido, recepción, gasto…). */
  referenciaId?: string;
  creadoEn: string;
}

// ─── Usuarios ─────────────────────────────────────────────────────

export interface UsuarioSistema {
  id: string;
  nombre: string;
  email: string;
  /** Contraseña en texto plano solo para demostración local (localStorage). */
  password?: string;
  rol: RolUsuario;
  permisos: string[];
  activo: boolean;
}

/** Datos del formulario de creación de usuario. */
export type NuevoUsuario = Pick<UsuarioSistema, "nombre" | "email" | "rol"> & { password?: string };

// ─── Proveedores y compras (Fase 3) ──────────────────────────────

export interface Proveedor {
  id: string;
  nombre: string;
  telefono?: string;
  creadoEn: string;
}

export interface LineaRecepcion {
  productoId: string;
  nombre: string;
  codigoInterno: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface RecepcionCompra {
  id: string;
  numero: string;
  proveedorId: string;
  usuarioId: string;
  lineas: LineaRecepcion[];
  total: number;
  descontarCaja: boolean;
  creadoEn: string;
}

export interface Gasto {
  id: string;
  concepto: string;
  monto: number;
  usuarioId: string;
  creadoEn: string;
}

// ─── Inventarios y ajustes (Fase 2) ───────────────────────────────

export interface LineaConteo {
  productoId: string;
  nombre: string;
  stockTeorico: number;
  stockFisico: number;
  diferencia: number;
}

export interface ConteoInventario {
  id: string;
  tipo: "general" | "aleatorio";
  usuarioId: string;
  turno: string;
  iniciadoEn: string;
  finalizadoEn?: string;
  lineas: LineaConteo[];
  estado: "en-curso" | "confirmado" | "cancelado";
}

export interface AjusteInventario {
  id: string;
  conteoId: string;
  usuarioId: string;
  lineas: LineaConteo[];
  /** Motivo para ajustes manuales: pérdida, robo, corrección, reversión, vencimiento, donación… */
  motivo?: string;
  comentario?: string;
  creadoEn: string;
}

// ─── Precios (Fase 4) ─────────────────────────────────────────────

export interface CambioPrecio {
  id: string;
  productoId: string;
  valorAnterior: number;
  valorNuevo: number;
  usuarioId: string;
  fecha: string;
}

// ─── Cierres de día ───────────────────────────────────────────────

export interface CierreDia {
  id: string;
  /** Fecha del día cerrado (YYYY-MM-DD) */
  fecha: string;
  usuarioId: string;
  totalVentas: number;
  totalIngresos: number;
  totalEgresos: number;
  pedidosCount: number;
  pendientesTrasladados: number;
  pendientesCancelados: number;
  /** Conteo físico de efectivo y Nequi al cerrar */
  conteoEfectivo?: number;
  conteoNequi?: number;
  diferenciaEfectivo?: number;
  diferenciaNequi?: number;
  creadoEn: string;
}

// ─── Alias de compatibilidad (migración) ──────────────────────────

export type ClienteOperacion = Cliente;
export type PedidoOperacion = Pedido;
