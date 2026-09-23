import { useMemo, useState } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { IconArrowLeft, IconCheckCircle } from "../../../components/Icons";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/OperacionesContext";
import type { EstadoPedido, Pedido } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

interface PedidoDetalleProps {
  pedido: Pedido;
  onVolver: () => void;
  /** Permite cobrar el saldo pendiente y marcar como entregado. */
  permitirCobro?: boolean;
  /**
   * `verde`: cabecera oscura de la app (vendedor, igual que crear pedido).
   * `compacto`: barra con borde para el panel administrativo.
   */
  varianteHeader?: "verde" | "compacto";
  /** Sin acciones: solo consulta de datos, estado y auditoría. */
  soloLectura?: boolean;
}

const estados: Array<{ valor: EstadoPedido; etiqueta: string; clase: string }> = [
  { valor: "pendiente", etiqueta: "Pendiente", clase: "bg-paper text-ink" },
  { valor: "en-preparacion", etiqueta: "En preparación", clase: "bg-accent-soft text-accent-dark" },
  { valor: "entregado", etiqueta: "Entregado", clase: "bg-success-soft text-success" },
  { valor: "cancelado", etiqueta: "Cancelado", clase: "bg-danger-soft text-danger" },
];

function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Detalle de pedido compacto: solo la lista central hace scroll,
 * la cabecera y el pie quedan siempre visibles.
 */
export function PedidoDetalle({ pedido, onVolver, permitirCobro = false, varianteHeader = "verde", soloLectura = false }: PedidoDetalleProps) {
  const { obtenerCliente, actualizarEstadoPedido, adjuntarComprobante, registrarPagoPedido, nombreUsuario, abonos } = useOperaciones();
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();
  const [estadoPendiente, setEstadoPendiente] = useState<EstadoPedido | null>(null);
  const [confirmarCobro, setConfirmarCobro] = useState(false);

  const cliente = useMemo(() => obtenerCliente(pedido.clienteId), [obtenerCliente, pedido.clienteId]);
  const pagosDelPedido = useMemo(
    () => abonos.filter((abono) => abono.pedidosAfectados.some((p) => p.pedidoId === pedido.id)),
    [abonos, pedido.id],
  );
  const pendiente = pedido.pago.saldoPendiente;
  const porPreparar = pedido.estado === "pendiente" || pedido.estado === "en-preparacion";
  const unidades = pedido.lineas.reduce((suma, linea) => suma + linea.cantidad, 0);

  function confirmarCambioEstado() {
    if (!estadoPendiente) return;
    const etiqueta = estadoPendiente.replace("-", " ");
    actualizarEstadoPedido(pedido.id, estadoPendiente);
    setEstadoPendiente(null);
    mostrarAviso(`Pedido ${pedido.numero} → ${etiqueta}`, "exito");
  }

  function cobrarYEntregar() {
    if (pendiente <= 0) return;
    // El dinero recibido es de este pedido: no se reparte entre otras deudas del cliente.
    const abono = registrarPagoPedido(pedido.id, "efectivo", `Cobro al entregar ${pedido.numero}`);
    if (!abono) {
      mostrarAviso("No se pudo registrar el cobro", "error");
      return;
    }
    if (pedido.estado !== "entregado") actualizarEstadoPedido(pedido.id, "entregado");
    setConfirmarCobro(false);
    mostrarAviso(`Cobrado ${formatoMoneda(pendiente)} · pedido entregado`, "exito");
  }

  const etiquetaEstado = (
    <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${porPreparar ? "bg-accent-soft text-accent-dark" : pedido.estado === "cancelado" ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
      {pedido.estado.replace("-", " ")}
    </span>
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* ─── Cabecera ─── */}
      {varianteHeader === "verde" ? (
        <BarraSuperior
          titulo={pedido.numero}
          subtitulo={`${formatoFechaHora(pedido.creadoEn)} · ${unidades} und`}
          onVolver={onVolver}
          derecha={etiquetaEstado}
        />
      ) : (
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b border-line pb-2.5">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-line bg-paper-raised text-ink active:bg-paper-sunken"
          >
            <IconArrowLeft width={18} height={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[13px] font-bold text-ink">{pedido.numero}</p>
            <p className="truncate text-[11.5px] text-ink-soft">{formatoFechaHora(pedido.creadoEn)} · {unidades} und</p>
          </div>
          {etiquetaEstado}
        </div>
      )}

      {/* ─── Resumen fijo: total, saldo y cliente ─── */}
      <div className="flex-shrink-0 px-5 pt-3 md:px-6">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-2xl border border-line bg-paper-raised px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Total</p>
            <p className="font-mono text-[16px] font-bold text-ink">{formatoMoneda(pedido.total)}</p>
            <p className={`mt-0.5 text-[11px] font-semibold ${pendiente > 0 ? "text-danger" : "text-success"}`}>
              {pendiente > 0 ? `Debe ${formatoMoneda(pendiente)}` : "Pagado"}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl border border-line bg-paper-raised px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Cliente</p>
            <p className="truncate text-[13px] font-semibold text-ink">{cliente?.nombre ?? "Cliente"}</p>
            <p className="truncate text-[11px] text-ink-soft">{cliente?.telefono || "sin teléfono"}</p>
          </div>
        </div>

        {/* ─── Estados: gestión o consulta según el módulo ─── */}
        {soloLectura ? (
          <div className="mt-3 rounded-xl border border-line bg-paper-sunken/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Solo lectura</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">
              Los cambios de estado y el cobro se hacen desde <span className="font-semibold text-ink">Ventas</span>.
            </p>
          </div>
        ) : (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Cambiar estado</p>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {estados.map((estado) => (
              <button
                key={estado.valor}
                type="button"
                onClick={() => {
                  if (estado.valor !== pedido.estado) setEstadoPendiente(estado.valor);
                }}
                aria-pressed={pedido.estado === estado.valor}
                className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  pedido.estado === estado.valor ? "border-ink bg-ink text-white" : `border-line ${estado.clase}`
                }`}
              >
                {estado.etiqueta}
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* ─── Único scroll: líneas e historial ─── */}
      <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-2 md:px-6">
        <div className="rounded-2xl border border-line bg-paper-sunken/30 p-2">
          <ul className="space-y-1.5">
            {pedido.lineas.map((linea) => (
              <li key={linea.productoId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-ink">{linea.nombre}</p>
                  <p className="text-[11px] text-ink-soft">{linea.cantidad} × {formatoMoneda(linea.precioUnitario)}</p>
                </div>
                <span className="flex-shrink-0 font-mono text-[12.5px] font-semibold text-ink">{formatoMoneda(linea.subtotal)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-2 rounded-xl border border-line bg-paper-raised px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Auditoría</p>
            <p className="text-[11px] text-ink-soft">
              Generó el pedido: <span className="font-semibold text-ink">{nombreUsuario(pedido.vendedorId)}</span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {pedido.historialEstados.map((entrada, indice) => (
                <li key={`${entrada.fecha}-${indice}`} className="flex items-center gap-2 text-[11px] text-ink-soft">
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${entrada.estado === "entregado" ? "bg-success" : entrada.estado === "cancelado" ? "bg-danger" : entrada.estado === "en-preparacion" ? "bg-accent" : "bg-ink-faint"}`} />
                  <span className="capitalize text-ink">{entrada.estado.replace("-", " ")}</span>
                  <span className="truncate">· {nombreUsuario(entrada.usuarioId)} · {formatoFechaHora(entrada.fecha)}</span>
                </li>
              ))}
            </ul>
          </div>

          {pagosDelPedido.length > 0 && (
            <div className="mt-2 rounded-xl border border-success/25 bg-success-soft/60 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-success">Pagos recibidos ({pagosDelPedido.length})</p>
              <ul className="space-y-1">
                {pagosDelPedido.map((abono) => {
                  const aplicado = abono.pedidosAfectados.find((p) => p.pedidoId === pedido.id)?.montoAplicado ?? 0;
                  return (
                    <li key={abono.id} className="flex items-center justify-between gap-2 text-[11px] text-ink-soft">
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-semibold text-ink">{formatoMoneda(aplicado)}</span> · <span className="capitalize">{abono.metodo}</span> · recibió {nombreUsuario(abono.usuarioId)}
                      </span>
                      <span className="flex-shrink-0">{new Date(abono.creadoEn).toLocaleDateString("es-CO")}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

      {/* ─── Pie fijo ─── */}
      {(!soloLectura || pedido.comprobantePagoUrl) && (
        <BarraInferior>
          <div className="space-y-2">
            {!soloLectura &&
              permitirCobro &&
              (pendiente > 0 ? (
                <button
                  type="button"
                  onClick={() => setConfirmarCobro(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 text-[13.5px] font-semibold text-white active:opacity-90"
                >
                  <IconCheckCircle width={17} height={17} />
                  Cobrar al entregar · {formatoMoneda(pendiente)}
                </button>
              ) : (
                <div
                  role="status"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-success/30 bg-success-soft py-3 text-[13.5px] font-semibold text-success"
                >
                  <IconCheckCircle width={17} height={17} />
                  Pedido cobrado · {formatoMoneda(pedido.pago.montoRecibido)}
                </div>
              ))}
            <div className="flex gap-2">
              {!soloLectura && (
                <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-paper py-2.5 text-[11.5px] font-semibold text-ink-soft active:bg-paper-sunken">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="sr-only"
                    onChange={(evento) => {
                      const archivo = evento.target.files?.[0];
                      if (archivo) void adjuntarComprobante(pedido.id, archivo);
                    }}
                  />
                  {pedido.comprobantePagoUrl ? "Cambiar comprobante" : "Adjuntar comprobante"}
                </label>
              )}
              {pedido.comprobantePagoUrl && (
                <a
                  href={pedido.comprobantePagoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center justify-center rounded-xl border border-line bg-paper px-3 py-2.5 text-[11.5px] font-semibold text-teal ${soloLectura ? "flex-1" : ""}`}
                >
                  {soloLectura ? "Ver comprobante de pago" : "Ver"}
                </a>
              )}
            </div>
          </div>
        </BarraInferior>
      )}

      <ConfirmarAccion
        abierto={estadoPendiente !== null}
        titulo="Cambiar estado"
        mensaje={
          estadoPendiente === "cancelado"
            ? `¿Seguro que quieres cancelar ${pedido.numero}? Se reversan stock, caja y cartera.`
            : `¿Confirmas cambiar ${pedido.numero} a “${estadoPendiente?.replace("-", " ")}”? Queda registrado con usuario y fecha.`
        }
        textoConfirmar="Sí, cambiar"
        tono={estadoPendiente === "cancelado" ? "peligro" : "ink"}
        alCancelar={() => setEstadoPendiente(null)}
        alConfirmar={confirmarCambioEstado}
      />

      <ConfirmarAccion
        abierto={confirmarCobro}
        titulo="Cobrar y entregar"
        mensaje={`Se registrará un abono de ${formatoMoneda(pendiente)} en efectivo y el pedido quedará entregado.`}
        textoConfirmar="Sí, cobrar"
        tono="exito"
        alCancelar={() => setConfirmarCobro(false)}
        alConfirmar={cobrarYEntregar}
      />
    </div>
  );
}