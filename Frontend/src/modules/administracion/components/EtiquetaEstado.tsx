import type { EstadoPedido } from "../../../types";
import { CLASES_ESTADO } from "../../../utils/estados";

interface EtiquetaEstadoProps {
  estado: EstadoPedido;
  /** Versión reducida para tarjetas de listado. */
  compacta?: boolean;
}

/** Badge de estado del pedido con color propio. */
export function EtiquetaEstado({ estado, compacta = false }: EtiquetaEstadoProps) {
  return (
    <span
      className={`flex-shrink-0 rounded-full font-semibold capitalize ${CLASES_ESTADO[estado]} ${
        compacta ? "px-1.5 py-0.5 text-[9.5px]" : "px-2.5 py-1 text-[10.5px]"
      }`}
    >
      {estado.replace("-", " ")}
    </span>
  );
}
