import type { EstadoPedido } from "../../../types";

const CLASES: Record<EstadoPedido, string> = {
  pendiente: "bg-paper-sunken text-ink-soft",
  "en-preparacion": "bg-accent-soft text-accent-dark",
  entregado: "bg-success-soft text-success",
  cancelado: "bg-danger-soft text-danger",
};

interface EtiquetaEstadoProps {
  estado: EstadoPedido;
  /** Versión reducida para tarjetas de listado. */
  compacta?: boolean;
}

/** Badge de estado del pedido con color propio. */
export function EtiquetaEstado({ estado, compacta = false }: EtiquetaEstadoProps) {
  return (
    <span
      className={`flex-shrink-0 rounded-full font-semibold capitalize ${CLASES[estado]} ${
        compacta ? "px-1.5 py-0.5 text-[9.5px]" : "px-2.5 py-1 text-[10.5px]"
      }`}
    >
      {estado.replace("-", " ")}
    </span>
  );
}
