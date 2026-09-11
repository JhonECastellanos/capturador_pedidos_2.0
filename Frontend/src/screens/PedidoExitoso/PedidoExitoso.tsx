import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Boton } from "../../components/Boton";
import { IconCheckCircle } from "../../components/Icons";
import { usePedido } from "../../context/PedidoContext";
import { formatoMoneda } from "../../utils/formato";
import type { Pedido } from "../../types";

export default function PedidoExitoso() {
  const navegar = useNavigate();
  const location = useLocation();
  const { reiniciarPedido } = usePedido();
  const pedido = (location.state as { pedido?: Pedido } | null)?.pedido;
  const yaReinicio = useRef(false);

  useEffect(() => {
    if (!yaReinicio.current) {
      reiniciarPedido();
      yaReinicio.current = true;
    }
  }, [reiniciarPedido]);

  useEffect(() => {
    if (!pedido) navegar("/", { replace: true });
  }, [pedido, navegar]);

  if (!pedido) return null;

  return (
    <div className="flex h-full flex-col">
      <main className="no-scrollbar flex flex-1 flex-col items-center overflow-y-auto px-6 pb-6 pt-[max(3rem,env(safe-area-inset-top))] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
          <IconCheckCircle width={32} height={32} />
        </div>
        <h1 className="mt-5 font-display text-[22px] font-semibold text-ink">
          Pedido confirmado
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">{pedido.fecha}</p>

        <div className="mt-3 rounded-full bg-paper-sunken px-4 py-1.5 font-mono text-[13px] font-semibold tracking-wide text-ink">
          {pedido.numero}
        </div>

        <div className="mt-6 w-full max-w-sm rounded-xl border border-line bg-paper-raised p-4 text-left">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Cliente
          </p>
          <p className="mt-1 text-[14.5px] font-medium text-ink">
            {pedido.cliente.nombre}
          </p>

          <div className="ticket-edge -mx-4 my-3.5" />

          <div className="flex items-center justify-between text-[13.5px]">
            <span className="text-ink-soft">Productos</span>
            <span className="font-mono text-ink">{pedido.items.length}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[13.5px] text-ink-soft">Total</span>
            <span className="font-mono text-[17px] font-semibold text-ink">
              {formatoMoneda(pedido.total)}
            </span>
          </div>
        </div>
      </main>

      <div className="flex-shrink-0 space-y-2.5 border-t border-line bg-paper-raised px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:px-6">
        <Boton variante="primario" onClick={() => navegar("/cliente")}>
          Capturar otro pedido
        </Boton>
        <Boton variante="fantasma" onClick={() => navegar("/")}>
          Ir a inicio
        </Boton>
      </div>
    </div>
  );
}
