export type MetodoPago = "efectivo" | "nequi" | "credito";
export type EstadoPedido = "pendiente" | "en-preparacion" | "entregado" | "cancelado";
export type RolUsuario = "administrador" | "vendedor";

export type EstadoCuenta = "al-dia" | "pendiente";

export interface ClienteOperacion {
  id: string;
  nombre: string;
  alias: string;
  identificacion: string;
  telefono: string;
  ciudad: string;
  direccion: string;
  estadoCuenta: EstadoCuenta;
  saldoPendiente: number;
}

export interface NuevoCliente {
  nombre: string;
  alias: string;
  identificacion: string;
  telefono: string;
  ciudad: string;
  direccion: string;
}

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

export interface PedidoOperacion {
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
}

export interface NuevoPedido {
  clienteId: string;
  vendedorId: string;
  lineas: LineaPedido[];
  total: number;
  pago: PagoPedido;
}

export interface MovimientoCaja {
  id: string;
  tipo: "ingreso" | "egreso";
  concepto: string;
  monto: number;
  metodo?: MetodoPago;
  creadoEn: string;
}

export interface UsuarioSistema {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  permisos: string[];
  activo: boolean;
}
