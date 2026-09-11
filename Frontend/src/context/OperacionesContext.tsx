import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { clientes as clientesIniciales } from "../data/clientes";
import { productos as productosIniciales } from "../data/productos";
import type { Cliente, Producto } from "../types";
import type { ClienteOperacion, EstadoPedido, MovimientoCaja, NuevoCliente, NuevoPedido, PedidoOperacion, RolUsuario, UsuarioSistema } from "../modules/clientes-pedido/types";

function normalizarCliente(cliente: Cliente): ClienteOperacion {
  return { id: cliente.id, nombre: cliente.nombre, alias: cliente.nombre, identificacion: cliente.identificacion, telefono: cliente.telefono, ciudad: cliente.ciudad, direccion: cliente.direccion, estadoCuenta: "al-dia", saldoPendiente: 0 };
}

const pedidosDemo: PedidoOperacion[] = [
  { id: "pedido-demo-1", numero: "PED-1082", clienteId: "c1", vendedorId: "usuario-vendedor", lineas: [{ productoId: "p1", nombre: "Gaseosa Cola 1.5L", cantidad: 4, precioUnitario: 5200, subtotal: 20800 }], subtotal: 20800, total: 20800, pago: { metodo: "efectivo", montoRecibido: 20800, saldoPendiente: 0, estado: "pagado", recordatorioWhatsApp: false }, estado: "entregado", creadoEn: "2026-09-08T14:30:00.000Z" },
  { id: "pedido-demo-2", numero: "PED-1081", clienteId: "c3", vendedorId: "usuario-vendedor", lineas: [{ productoId: "p8", nombre: "Detergente en Polvo 3kg", cantidad: 2, precioUnitario: 24500, subtotal: 49000 }], subtotal: 49000, total: 49000, pago: { metodo: "credito", montoRecibido: 0, saldoPendiente: 49000, estado: "pendiente", recordatorioWhatsApp: true }, estado: "en-preparacion", creadoEn: "2026-09-08T13:15:00.000Z" },
  { id: "pedido-demo-3", numero: "PED-1080", clienteId: "c2", vendedorId: "usuario-vendedor", lineas: [{ productoId: "p2", nombre: "Agua Sin Gas 600ml x12", cantidad: 3, precioUnitario: 18900, subtotal: 56700 }], subtotal: 56700, total: 56700, pago: { metodo: "nequi", montoRecibido: 56700, saldoPendiente: 0, estado: "pagado", recordatorioWhatsApp: false }, estado: "pendiente", creadoEn: "2026-09-08T11:00:00.000Z" },
];

const usuariosDemo: UsuarioSistema[] = [
  { id: "usuario-administrador", nombre: "Perfil administrador", email: "", rol: "administrador", permisos: ["pedidos", "inventario", "caja", "usuarios", "cierre-diario"], activo: true },
  { id: "usuario-vendedor", nombre: "Perfil vendedor", email: "", rol: "vendedor", permisos: ["clientes", "pedidos", "cobros"], activo: true },
];

interface CrearProductoDatos { nombre: string; categoria: string; precio: number; unidad: string; stock: number; imagenUrl?: string; }

interface OperacionesContextValue {
  clientes: ClienteOperacion[];
  pedidos: PedidoOperacion[];
  inventario: Producto[];
  movimientosCaja: MovimientoCaja[];
  usuarios: UsuarioSistema[];
  clienteActivo: ClienteOperacion | null;
  crearCliente: (datos: NuevoCliente) => ClienteOperacion;
  seleccionarClienteActivo: (clienteId: string) => void;
  obtenerCliente: (clienteId: string) => ClienteOperacion | null;
  registrarPedido: (datos: NuevoPedido) => PedidoOperacion;
  obtenerPedido: (pedidoId: string) => PedidoOperacion | null;
  actualizarEstadoPedido: (pedidoId: string, estado: EstadoPedido) => void;
  adjuntarComprobante: (pedidoId: string, archivo: File) => void;
  actualizarImagenProducto: (productoId: string, archivo: File) => void;
  crearProducto: (datos: CrearProductoDatos) => Producto;
  registrarEgresoCaja: (concepto: string, monto: number) => void;
  crearUsuario: (nombre: string, email: string, rol: RolUsuario) => void;
}

const OperacionesContext = createContext<OperacionesContextValue | undefined>(undefined);

export function OperacionesProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<ClienteOperacion[]>(() => clientesIniciales.map(normalizarCliente));
  const [pedidos, setPedidos] = useState<PedidoOperacion[]>(pedidosDemo);
  const [inventario, setInventario] = useState<Producto[]>(productosIniciales);
  const [clienteActivoId, setClienteActivoId] = useState<string | null>(null);
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>(() => pedidosDemo.filter((pedido) => pedido.pago.montoRecibido > 0).map((pedido) => ({ id: `caja-${pedido.id}`, tipo: "ingreso", concepto: `Pago ${pedido.numero}`, monto: pedido.pago.montoRecibido, metodo: pedido.pago.metodo, creadoEn: pedido.creadoEn })));
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>(usuariosDemo);

  const crearCliente = useCallback((datos: NuevoCliente) => {
    const nuevoCliente: ClienteOperacion = { id: `cliente-${Date.now()}`, ...datos, estadoCuenta: "al-dia", saldoPendiente: 0 };
    setClientes((actuales) => [nuevoCliente, ...actuales]);
    setClienteActivoId(nuevoCliente.id);
    return nuevoCliente;
  }, []);

  const seleccionarClienteActivo = useCallback((clienteId: string) => setClienteActivoId(clienteId), []);
  const obtenerCliente = useCallback((clienteId: string) => clientes.find((cliente) => cliente.id === clienteId) ?? null, [clientes]);

  const registrarPedido = useCallback((datos: NuevoPedido) => {
    const pedido: PedidoOperacion = { id: `pedido-${Date.now()}`, numero: `PED-${Math.floor(1000 + Math.random() * 9000)}`, clienteId: datos.clienteId, vendedorId: datos.vendedorId, lineas: datos.lineas, subtotal: datos.total, total: datos.total, pago: datos.pago, estado: "pendiente", creadoEn: new Date().toISOString() };
    setPedidos((actuales) => [pedido, ...actuales]);
    setInventario((actuales) => actuales.map((producto) => {
      const linea = pedido.lineas.find((item) => item.productoId === producto.id);
      return linea ? { ...producto, stock: Math.max(0, producto.stock - linea.cantidad) } : producto;
    }));
    if (datos.pago.montoRecibido > 0) {
      setMovimientosCaja((actuales) => [{ id: `caja-${pedido.id}`, tipo: "ingreso", concepto: `Pago ${pedido.numero}`, monto: datos.pago.montoRecibido, metodo: datos.pago.metodo, creadoEn: pedido.creadoEn }, ...actuales]);
    }
    if (datos.pago.saldoPendiente > 0) {
      setClientes((actuales) => actuales.map((cliente) => cliente.id === datos.clienteId ? { ...cliente, estadoCuenta: "pendiente", saldoPendiente: cliente.saldoPendiente + datos.pago.saldoPendiente } : cliente));
    }
    setClienteActivoId(datos.clienteId);
    return pedido;
  }, []);

  const obtenerPedido = useCallback((pedidoId: string) => pedidos.find((pedido) => pedido.id === pedidoId) ?? null, [pedidos]);
  const actualizarEstadoPedido = useCallback((pedidoId: string, estado: EstadoPedido) => setPedidos((actuales) => actuales.map((pedido) => pedido.id === pedidoId ? { ...pedido, estado } : pedido)), []);
  const adjuntarComprobante = useCallback((pedidoId: string, archivo: File) => {
    const comprobantePagoUrl = URL.createObjectURL(archivo);
    setPedidos((actuales) => actuales.map((pedido) => pedido.id === pedidoId ? { ...pedido, comprobantePagoUrl, comprobantePagoNombre: archivo.name } : pedido));
  }, []);
  const actualizarImagenProducto = useCallback((productoId: string, archivo: File) => {
    const imagenUrl = URL.createObjectURL(archivo);
    setInventario((actuales) => actuales.map((producto) => producto.id === productoId ? { ...producto, imagenUrl } : producto));
  }, []);
  const crearProducto = useCallback((datos: CrearProductoDatos) => {
    const producto: Producto = { id: `producto-${Date.now()}`, ...datos, colorEtiqueta: "#2f7a6c" };
    setInventario((actuales) => [producto, ...actuales]);
    return producto;
  }, []);
  const registrarEgresoCaja = useCallback((concepto: string, monto: number) => {
    setMovimientosCaja((actuales) => [{ id: `egreso-${Date.now()}`, tipo: "egreso", concepto, monto, creadoEn: new Date().toISOString() }, ...actuales]);
  }, []);
  const crearUsuario = useCallback((nombre: string, email: string, rol: RolUsuario) => {
    const permisos = rol === "administrador" ? ["pedidos", "inventario", "caja", "usuarios", "cierre-diario"] : ["clientes", "pedidos", "cobros"];
    setUsuarios((actuales) => [{ id: `usuario-${Date.now()}`, nombre, email, rol, permisos, activo: true }, ...actuales]);
  }, []);

  const clienteActivo = useMemo(() => clienteActivoId ? clientes.find((cliente) => cliente.id === clienteActivoId) ?? null : null, [clienteActivoId, clientes]);
  const value: OperacionesContextValue = { clientes, pedidos, inventario, movimientosCaja, usuarios, clienteActivo, crearCliente, seleccionarClienteActivo, obtenerCliente, registrarPedido, obtenerPedido, actualizarEstadoPedido, adjuntarComprobante, actualizarImagenProducto, crearProducto, registrarEgresoCaja, crearUsuario };
  return <OperacionesContext.Provider value={value}>{children}</OperacionesContext.Provider>;
}

export function useOperaciones() {
  const context = useContext(OperacionesContext);
  if (!context) throw new Error("useOperaciones debe usarse dentro de <OperacionesProvider>");
  return context;
}
