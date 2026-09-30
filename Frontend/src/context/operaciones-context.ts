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

type Resultado<T> = T | null | Promise<T | null>;
type Accion = void | boolean | Promise<boolean>;

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
  crearCliente: (datos: NuevoCliente) => Resultado<Cliente>;
  seleccionarClienteActivo: (clienteId: string | null) => void;
  obtenerCliente: (clienteId: string | null) => Cliente | null;
  registrarPedido: (datos: NuevoPedido) => Resultado<Pedido>;
  obtenerPedido: (pedidoId: string) => Pedido | null;
  actualizarEstadoPedido: (pedidoId: string, estado: EstadoPedido) => Accion;
  adjuntarComprobante: (pedidoId: string, archivo: File) => Promise<void>;
  actualizarImagenProducto: (productoId: string, archivo: File) => Promise<void>;
  crearProducto: (datos: NuevoProducto) => Resultado<Producto>;
  registrarEgresoCaja: (concepto: string, monto: number, metodo?: "efectivo" | "billetera") => Accion;
  crearUsuario: (datos: NuevoUsuario) => Accion;
  cambiarEstadoUsuario: (usuarioId: string) => Accion;
  cambiarRolUsuario?: (usuarioId: string, rol: UsuarioSistema["rol"]) => Promise<boolean>;
  crearProveedor: (nombre: string, telefono?: string) => Resultado<Proveedor>;
  obtenerProveedor: (id: string) => Proveedor | null;
  registrarRecepcion: (proveedorId: string, lineas: LineaRecepcion[], descontarCaja: boolean) => Resultado<RecepcionCompra>;
  registrarGasto: (concepto: string, monto: number) => Resultado<Gasto>;
  iniciarConteo: (tipo: ConteoInventario["tipo"], cantidadAleatoria: number | null, turno: string) => Resultado<ConteoInventario>;
  actualizarConteoLinea: (conteoId: string, productoId: string, stockFisico: number) => Accion;
  finalizarConteoActivo: (conteoId: string) => Accion;
  cancelarConteoActivo: (conteoId: string) => Accion;
  aplicarAjusteDeConteo: (conteoId: string) => Accion;
  registrarAjusteManual: (productoId: string, stockFisico: number, motivo: string, comentario?: string) => Accion;
  actualizarPrecioProducto: (productoId: string, nuevoPrecio: number) => Accion;
  trasladarPedidoAHoy: (pedidoId: string) => Accion;
  registrarCierre: (datos: Omit<CierreDia, "id" | "usuarioId" | "creadoEn">) => Resultado<CierreDia>;
  registrarAbono: (clienteId: string, monto: number, metodo: AbonoCredito["metodo"], comentario?: string) => Resultado<AbonoCredito>;
  registrarPagoPedido: (pedidoId: string, metodo: AbonoCredito["metodo"], comentario?: string) => Resultado<AbonoCredito>;
}

export const OperacionesContext = createContext<OperacionesContextValue | undefined>(undefined);
