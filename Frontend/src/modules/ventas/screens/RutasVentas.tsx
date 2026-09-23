import { useNavigate, useParams } from "react-router-dom";
import CrearCliente from "../../../screens/ClientesPedido/CrearCliente";
import { useOperaciones } from "../../../context/OperacionesContext";
import { Abonos } from "./Abonos";
import { FlujoVenta } from "./FlujoVenta";
import { InicioVentas } from "./InicioVentas";
import { PedidoCompletado } from "./PedidoCompletado";
import { PedidoDetalle } from "./PedidoDetalle";

/** Detalle de pedido a pantalla completa: aquí se cambia el estado y se cobra. */
function DetalleDePedido({ rutaInicio }: { rutaInicio: string }) {
  const navegar = useNavigate();
  const { pedidoId } = useParams<{ pedidoId: string }>();
  const { obtenerPedido } = useOperaciones();
  const pedido = pedidoId ? obtenerPedido(pedidoId) : null;

  if (!pedido) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13.5px] font-medium text-ink">Pedido no encontrado</p>
        <button
          type="button"
          onClick={() => navegar(rutaInicio)}
          className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return <PedidoDetalle pedido={pedido} onVolver={() => navegar(rutaInicio)} permitirCobro />;
}

/* ─── Vendedor ───────────────────────────────────────────────────── */

export function VendedorInicio() {
  return (
    <InicioVentas
      rutaPedido="/vendedor/pedido"
      rutaAbonos="/vendedor/abonos"
      rutaNuevoCliente="/vendedor/clientes/nuevo"
      rutaDetalle={(pedidoId) => `/vendedor/pedido/${pedidoId}`}
      etiquetaRol="Vendedor"
      descripcion="Clientes, pedidos y cobros del día"
    />
  );
}

export function VendedorPedido() {
  return (
    <FlujoVenta
      rutaInicio="/vendedor"
      rutaNuevoCliente="/vendedor/clientes/nuevo"
      rutaCompletado="/vendedor/pedido/completado"
    />
  );
}

export function VendedorPedidoCompletado() {
  return <PedidoCompletado rutaInicio="/vendedor" rutaNuevoPedido="/vendedor/pedido" />;
}

export function VendedorAbonos() {
  const navegar = useNavigate();
  return <Abonos onVolver={() => navegar("/vendedor")} />;
}

/** Detalle del pedido seleccionado en la lista de hoy. */
export function VendedorPedidoDetalle() {
  return <DetalleDePedido rutaInicio="/vendedor" />;
}

/* ─── Administrador ─────────────────────────────────────────────── */

/** Inicio del módulo de ventas: el administrador también vende y cobra. */
export function AdminVentas() {
  return (
    <InicioVentas
      rutaPedido="/admin/ventas/pedido"
      rutaAbonos="/admin/ventas/abonos"
      rutaNuevoCliente="/admin/ventas/clientes/nuevo"
      rutaDetalle={(pedidoId) => `/admin/ventas/pedido/${pedidoId}`}
      etiquetaRol="Administrador · Ventas"
      descripcion="Vende, cobra y gestiona los pedidos del día"
    />
  );
}

export function AdminVentasPedido() {
  return (
    <FlujoVenta
      rutaInicio="/admin/ventas"
      rutaNuevoCliente="/admin/ventas/clientes/nuevo"
      rutaCompletado="/admin/ventas/completado"
      titulo="Tomar pedido"
    />
  );
}

export function AdminVentasPedidoDetalle() {
  return <DetalleDePedido rutaInicio="/admin/ventas" />;
}

export function AdminVentasAbonos() {
  const navegar = useNavigate();
  return <Abonos onVolver={() => navegar("/admin/ventas")} />;
}

export function AdminVentasCompletado() {
  return <PedidoCompletado rutaInicio="/admin/ventas" rutaNuevoPedido="/admin/ventas/pedido" />;
}

export function AdminVentasClienteNuevo() {
  return <CrearCliente rutaInicio="/admin/ventas" rutaTrasGuardar="/admin/ventas" />;
}
