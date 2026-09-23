/**
 * Shim de compatibilidad: el modelo de dominio vive en src/types.
 * Los alias antiguos (ClienteOperacion, PedidoOperacion) se mantienen
 * para no romper importes durante la migración.
 */
export type {
  MetodoPago,
  EstadoPedido,
  RolUsuario,
  EstadoCuenta,
  Cliente,
  ClienteOperacion,
  NuevoCliente,
  LineaPedido,
  PagoPedido,
  Pedido,
  PedidoOperacion,
  NuevoPedido,
  MovimientoCaja,
  UsuarioSistema,
} from "../../types";
