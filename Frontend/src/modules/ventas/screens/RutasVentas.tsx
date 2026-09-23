import { useNavigate, useParams } from "react-router-dom";
import CrearCliente from "../../../screens/ClientesPedido/CrearCliente";
import { useOperaciones } from "../../../context/OperacionesContext";
import { Abonos } from "./Abonos";
import { FlujoVenta } from "./FlujoVenta";
import { PedidoCompletado } from "./PedidoCompletado";
import { PedidoDetalle } from "./PedidoDetalle";

/* ─── Vendedor ───────────────────────────────────────────────────── */

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

/** Detalle a pantalla completa del pedido seleccionado en el historial. */
export function VendedorPedidoDetalle() {
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
          onClick={() => navegar("/vendedor")}
          className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return <PedidoDetalle pedido={pedido} onVolver={() => navegar("/vendedor")} permitirCobro />;
}

/* ─── Administrador ─────────────────────────────────────────────── */

export function AdminVentas() {
  return (
    <FlujoVenta
      rutaInicio="/admin"
      rutaNuevoCliente="/admin/ventas/clientes/nuevo"
      rutaCompletado="/admin/ventas/completado"
      titulo="Tomar pedido"
    />
  );
}

export function AdminVentasCompletado() {
  return <PedidoCompletado rutaInicio="/admin/ventas" rutaNuevoPedido="/admin/ventas" />;
}

export function AdminVentasClienteNuevo() {
  return <CrearCliente rutaInicio="/admin/ventas" rutaTrasGuardar="/admin/ventas" />;
}
