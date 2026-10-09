import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { IconCheckCircle } from "../../../components/Icons";
import { useOperaciones } from "../../../context/operaciones";
import { formatoMoneda } from "../../../utils/formato";
import { formatoFechaHora } from "../../../utils/fechas";
import { DetalleProductosPedido } from "../components/DetalleProductosPedido";
import { useQuery } from "@tanstack/react-query";
import type { Envelope } from "@ambie/contrato";
import type { Pedido } from "../../../types";
import { respuestaRed, usaApi } from "../../../data/api";
import { claveConsulta } from "../../../data/query";

interface PedidoCompletadoProps {
  rutaInicio: string;
}
/** Pantalla de éxito compartida tras confirmar un pedido. */
export function PedidoCompletado({ rutaInicio }: PedidoCompletadoProps) {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { obtenerCliente, obtenerPedido, seleccionarClienteActivo } = useOperaciones();
  const pedidoId = (ubicacion.state as { pedidoId?: string } | null)?.pedidoId;
  const enContexto = pedidoId ? obtenerPedido(pedidoId) : null;
  const rutaPedido = `/pedidos/${encodeURIComponent(pedidoId ?? "")}`;
  const consulta = useQuery({ queryKey: claveConsulta(rutaPedido), queryFn: ({ signal }) => respuestaRed<Envelope<Pedido>>(rutaPedido, "GET", undefined, signal), enabled: usaApi && !!pedidoId,
    initialData: enContexto ? { data: enContexto } : undefined });
  const pedido = consulta.data?.data ?? enContexto;
  const cliente = pedido ? obtenerCliente(pedido.clienteId) : null;
  useEffect(() => {
    if (!pedidoId) navegar(rutaInicio, { replace: true });
  }, [navegar, pedidoId, rutaInicio]);

  if (!pedido) return <div className="p-5"><p role={consulta.error ? "alert" : "status"}>{consulta.error ? "El pedido ya se guardó, pero no se pudo cargar su detalle. No lo registres de nuevo." : "Cargando el pedido confirmado…"}</p>{consulta.error && <Boton onClick={() => void consulta.refetch()}>Reintentar detalle</Boton>}<Boton variante="fantasma" onClick={() => navegar(rutaInicio)}>Volver al inicio</Boton></div>;
  const nombreCliente = pedido.clienteId === null ? "Venta ocasional" : cliente?.nombre ?? pedido.clienteNombre ?? "Cliente registrado";

  const esCredito = pedido.pago.saldoPendiente > 0;
  const porPreparar = pedido.estado === "pendiente" || pedido.estado === "en-preparacion";
  return (
    <div className="flex h-full flex-col min-h-0">
      <BarraSuperior
        titulo={esCredito ? "Crédito registrado" : "Pedido confirmado"}
        subtitulo={`${pedido.numero} · ${nombreCliente}`}
        onVolver={() => navegar(rutaInicio)}
      />
      <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 pb-4 pt-5 text-center md:px-6">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${esCredito ? "bg-accent-soft text-accent-dark" : "bg-success-soft text-success"}`}>
          <IconCheckCircle width={32} height={32} />
        </div>
        <h1 className="mt-4 font-display text-[21px] font-semibold text-ink">
          {esCredito ? "Crédito registrado" : "Pedido confirmado"}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">{nombreCliente}</p>
        <p className="mt-1 text-[11.5px] text-ink-soft">{formatoFechaHora(pedido.creadoEn)}</p>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-paper-sunken px-4 py-1.5 font-mono text-[13px] font-semibold tracking-wide text-ink">{pedido.numero}</span>
          <span className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${porPreparar ? "bg-accent-soft text-accent-dark" : "bg-success-soft text-success"}`}>
            {porPreparar ? "Por preparar" : "Entregado"}
          </span>
        </div>
        <div className="mx-auto mt-5 w-full max-w-sm rounded-2xl border border-line bg-paper-raised p-4 text-left">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">{pedido.facturaNumero ? `Factura ${pedido.facturaNumero}` : "Resumen del pedido"}</p>
          <DetalleProductosPedido lineas={pedido.lineas} />
          <div className="ticket-edge -mx-4 my-3.5" />
          <div className="flex items-center justify-between text-[13.5px]"><span className="text-ink-soft">Subtotal</span><span className="font-mono text-ink">{formatoMoneda(pedido.subtotal)}</span></div>
          <div className="mt-2.5 flex items-center justify-between text-[13.5px]">
            <span className="text-ink-soft">Total</span>
            <span className="font-mono text-[17px] font-semibold text-ink">{formatoMoneda(pedido.total)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[13.5px]">
            <span className="text-ink-soft">Pago</span>
            <span className="font-medium capitalize text-ink">{pedido.pago.metodo}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[13.5px]"><span className="text-ink-soft">Recibido</span><span className="font-mono text-ink">{formatoMoneda(pedido.pago.montoRecibido)}</span></div>
          {esCredito && (
            <>
              <div className="ticket-edge -mx-4 my-3.5" />
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold text-danger">Saldo pendiente</span>
                <span className="font-mono text-[17px] font-semibold text-danger">{formatoMoneda(pedido.pago.saldoPendiente)}</span>
              </div>
            </>
          )}
        </div>
        {porPreparar && (
          <div className="mx-auto mt-4 flex w-full max-w-sm items-start gap-2 rounded-2xl border border-accent/30 bg-accent-soft p-3 text-left">
            <span className="mt-0.5 text-accent-dark">⏳</span>
            <div>
              <p className="text-[13px] font-semibold text-accent-dark">Queda por preparar</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
                Aparecerá pendiente en el panel de Pedidos. Cuando lo entregues, márcalo desde el detalle y cobra ahí mismo.
              </p>
            </div>
          </div>
        )}
      </main>
      <BarraInferior>
        <div className="space-y-2">
          <Boton
            onClick={() => {
              seleccionarClienteActivo(null);
              navegar(rutaInicio, { replace: true });
            }}
          >
            Capturar otro pedido
          </Boton>
          <Boton
            variante="fantasma"
            onClick={() => {
              seleccionarClienteActivo(null);
              navegar(rutaInicio, { replace: true });
            }}
          >
            Volver al inicio
          </Boton>
        </div>
      </BarraInferior>
    </div>
  );
}