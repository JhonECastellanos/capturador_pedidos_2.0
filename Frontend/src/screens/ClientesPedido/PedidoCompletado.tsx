import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Boton } from "../../components/Boton";
import { IconCheckCircle } from "../../components/Icons";
import { useOperaciones } from "../../context/OperacionesContext";
import { formatoMoneda } from "../../utils/formato";

export default function PedidoCompletado() {
  const navegar = useNavigate();
  const location = useLocation();
  const { obtenerCliente, obtenerPedido } = useOperaciones();
  const pedidoId = (location.state as { pedidoId?: string } | null)?.pedidoId;
  const pedido = pedidoId ? obtenerPedido(pedidoId) : null;
  const cliente = pedido ? obtenerCliente(pedido.clienteId) : null;

  useEffect(() => { if (!pedido) navegar("/vendedor", { replace: true }); }, [navegar, pedido]);
  if (!pedido || !cliente) return null;
  const esCredito = pedido.pago.saldoPendiente > 0;

  return (
    <div className="flex h-full flex-col">
      <main className="no-scrollbar flex flex-1 flex-col items-center overflow-y-auto px-6 pb-6 pt-[max(3rem,env(safe-area-inset-top))] text-center"><div className={`flex h-16 w-16 items-center justify-center rounded-full ${esCredito ? "bg-accent-soft text-accent-dark" : "bg-success-soft text-success"}`}><IconCheckCircle width={32} height={32} /></div><h1 className="mt-5 font-display text-[22px] font-semibold text-ink">{esCredito ? "Crédito registrado" : "Pedido confirmado"}</h1><p className="mt-1 text-[13.5px] text-ink-soft">{cliente.alias}</p><div className="mt-3 flex items-center gap-2"><span className="rounded-full bg-paper-sunken px-4 py-1.5 font-mono text-[13px] font-semibold tracking-wide text-ink">{pedido.numero}</span><span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize ${pedido.estado === "entregado" ? "bg-success-soft text-success" : pedido.estado === "en-preparacion" ? "bg-accent-soft text-accent-dark" : "bg-paper-sunken text-ink-soft"}`}>{pedido.estado.replace("-", " ")}</span></div>
        <div className="mt-6 w-full max-w-sm rounded-xl border border-line bg-paper-raised p-4 text-left"><p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen del pedido</p><div className="mt-3 flex items-center justify-between text-[13.5px]"><span className="text-ink-soft">Total</span><span className="font-mono text-[17px] font-semibold text-ink">{formatoMoneda(pedido.total)}</span></div><div className="mt-2 flex items-center justify-between text-[13.5px]"><span className="text-ink-soft">Pago</span><span className="font-medium capitalize text-ink">{pedido.pago.metodo}</span></div>{esCredito && <><div className="ticket-edge -mx-4 my-3.5" /><div className="flex items-center justify-between"><span className="text-[13.5px] font-semibold text-danger">Saldo pendiente</span><span className="font-mono text-[17px] font-semibold text-danger">{formatoMoneda(pedido.pago.saldoPendiente)}</span></div><p className="mt-1 text-[11.5px] text-ink-soft">Se cobra al entregar desde Créditos.</p></>}</div>
        {esCredito && <div className="mt-4 flex w-full max-w-sm items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3 text-left"><span className="mt-0.5 text-danger">●</span><div><p className="text-[13px] font-semibold text-danger">Recordatorio activado</p><p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">Este saldo queda marcado para seguimiento y envíos masivos por WhatsApp.</p></div></div>}
      </main>
      <div className="flex-shrink-0 space-y-2.5 border-t border-line bg-paper-raised px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:px-6"><Boton onClick={() => navegar("/vendedor/pedido", { replace: true, state: { clienteId: cliente.id } })}>Capturar otro pedido para {cliente.alias}</Boton><Boton variante="fantasma" onClick={() => navegar("/vendedor", { replace: true })}>Volver al inicio</Boton></div>
    </div>
  );
}
