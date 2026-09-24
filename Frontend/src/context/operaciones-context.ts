import { createContext } from "react";
import type {
  AbonoCredito,
  AjusteInventario,
  CambioPrecio,
  CierreDia,
  Cliente,
  ConteoInventario,
  EstadoPedido,
  Gasto,
  LineaRecepcion,
  MovimientoCaja,
  NuevoCliente,
  NuevoPedido,
  NuevoProducto,
  NuevoUsuario,
  Pedido,
  Producto,
  Proveedor,
  RecepcionCompra,
  UsuarioSistema,
} from "../types";

export interface OperacionesContextValue {
  clientes: Cliente[];
  pedidos: Pedido[];
  inventario: Producto[];
  movimientosCaja: MovimientoCaja[];
  usuarios: UsuarioSistema[];
  proveedores: Proveedor[];
  recepciones: RecepcionCompra[];
  gastos: Gasto[];
  conteos: ConteoInventario[];
  ajustes: AjusteInventario[];
  cambiosPrecio: CambioPrecio[];
  abonos: AbonoCredito[];
  cierres: CierreDia[];
  clienteActivo: Cliente | null;
  nombreUsuario: (usuarioId?: string) => string;
  crearCliente: (datos: NuevoCliente) => Cliente;
  seleccionarClienteActivo: (clienteId: string | null) => void;
  obtenerCliente: (clienteId: string) => Cliente | null;
  registrarPedido: (datos: NuevoPedido) => Pedido;
  obtenerPedido: (pedidoId: string) => Pedido | null;
  actualizarEstadoPedido: (pedidoId: string, estado: EstadoPedido) => void;
  adjuntarComprobante: (pedidoId: string, archivo: File) => Promise<void>;
  actualizarImagenProducto: (productoId: string, archivo: File) => Promise<void>;
  crearProducto: (datos: NuevoProducto) => Producto;
  registrarEgresoCaja: (concepto: string, monto: number) => void;
  crearUsuario: (datos: NuevoUsuario) => void;
  cambiarEstadoUsuario: (usuarioId: string) => void;
  crearProveedor: (nombre: string, telefono?: string) => Proveedor;
  obtenerProveedor: (id: string) => Proveedor | null;
  registrarRecepcion: (proveedorId: string, lineas: LineaRecepcion[], descontarCaja: boolean) => RecepcionCompra;
  registrarGasto: (concepto: string, monto: number) => Gasto;
  iniciarConteo: (tipo: ConteoInventario["tipo"], cantidadAleatoria: number | null, turno: string) => ConteoInventario;
  actualizarConteoLinea: (conteoId: string, productoId: string, stockFisico: number) => void;
  finalizarConteoActivo: (conteoId: string) => void;
  cancelarConteoActivo: (conteoId: string) => void;
  aplicarAjusteDeConteo: (conteoId: string) => void;
  registrarAjusteManual: (productoId: string, stockFisico: number, motivo: string, comentario?: string) => void;
  actualizarPrecioProducto: (productoId: string, nuevoPrecio: number) => void;
  trasladarPedidoAHoy: (pedidoId: string) => void;
  registrarCierre: (datos: Omit<CierreDia, "id" | "usuarioId" | "creadoEn">) => CierreDia;
  registrarAbono: (clienteId: string, monto: number, metodo: AbonoCredito["metodo"], comentario?: string) => AbonoCredito | null;
  registrarPagoPedido: (pedidoId: string, metodo: AbonoCredito["metodo"], comentario?: string) => AbonoCredito | null;
}

export const OperacionesContext = createContext<OperacionesContextValue | undefined>(undefined);
