import { useEffect, useMemo, useState } from "react";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { Paginacion } from "../../../components/Paginacion";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { useOperaciones } from "../../../context/OperacionesContext";
import type { EstadoPedido } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";
import { exportarPedidosCSV } from "../../../utils/exportar";
import { EtiquetaEstado } from "../../administracion/components/EtiquetaEstado";
import { EtiquetaPago } from "../../administracion/components/EtiquetaPago";
import { PedidoDetalle } from "../../ventas/screens/PedidoDetalle";

type Segmento = "hoy" | "historial";
type Periodo = "hoy" | "ayer" | "semana" | "mes" | "todo";
type FiltroEstado = "todos" | EstadoPedido;

function esMismoDia(fechaIso: string, referencia: Date): boolean {
  const d = new Date(fechaIso);
  return d.getFullYear() === referencia.getFullYear() && d.getMonth() === referencia.getMonth() && d.getDate() === referencia.getDate();
}

function dentroDePeriodo(fechaIso: string, periodo: Periodo, hoy: Date): boolean {
  if (periodo === "todo") return true;
  if (periodo === "hoy") return esMismoDia(fechaIso, hoy);
  const fecha = new Date(fechaIso);
  const copiaHoy = new Date(hoy);
  copiaHoy.setHours(0, 0, 0, 0);
  if (periodo === "ayer") {
    const ayer = new Date(copiaHoy);
    ayer.setDate(ayer.getDate() - 1);
    return esMismoDia(fechaIso, ayer);
  }
  if (periodo === "semana") {
    const hace7 = new Date(copiaHoy);
    hace7.setDate(hace7.getDate() - 7);
    return fecha >= hace7;
  }
  if (periodo === "mes") {
    const hace30 = new Date(copiaHoy);
    hace30.setDate(hace30.getDate() - 30);
    return fecha >= hace30;
  }
  return true;
}

function dentroDeRangoFecha(fechaIso: string, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  const fecha = new Date(fechaIso);
  fecha.setHours(0, 0, 0, 0);
  if (desde) {
    const dDesde = new Date(desde);
    dDesde.setHours(0, 0, 0, 0);
    if (fecha < dDesde) return false;
  }
  if (hasta) {
    const dHasta = new Date(hasta);
    dHasta.setHours(23, 59, 59, 999);
    if (fecha > dHasta) return false;
  }
  return true;
}

function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export function PedidosAdmin() {
  const { pedidos, obtenerCliente, nombreUsuario } = useOperaciones();
  const [segmento, setSegmento] = useState<Segmento>("hoy");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarFiltroFecha, setMostrarFiltroFecha] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const hoy = useMemo(() => new Date(), []);

  useEffect(() => { setPagina(1); }, [segmento, periodo, filtroEstado, busqueda, fechaDesde, fechaHasta]);
  const pedidoDetalle = useMemo(() => pedidos.find((p) => p.id === detalleId) ?? null, [detalleId, pedidos]);

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos
      .filter((pedido) => {
        if (segmento === "hoy" && !esMismoDia(pedido.creadoEn, hoy)) return false;
        if (segmento === "historial" && !dentroDePeriodo(pedido.creadoEn, periodo, hoy)) return false;
        if (!dentroDeRangoFecha(pedido.creadoEn, fechaDesde, fechaHasta)) return false;
        if (filtroEstado !== "todos" && pedido.estado !== filtroEstado) return false;
        if (q) {
          const cliente = obtenerCliente(pedido.clienteId);
          const coincide =
            pedido.numero.toLowerCase().includes(q) ||
            cliente?.nombre.toLowerCase().includes(q) ||
            cliente?.alias.toLowerCase().includes(q);
          if (!coincide) return false;
        }
        return true;
      })
      .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0));
  }, [busqueda, fechaDesde, fechaHasta, filtroEstado, hoy, obtenerCliente, pedidos, periodo, segmento]);

  const conteoHoy = pedidos.filter((p) => esMismoDia(p.creadoEn, hoy)).length;

  // El detalle es informativo: los estados y cobros se gestionan en Ventas.
  if (pedidoDetalle) {
    return <PedidoDetalle pedido={pedidoDetalle} onVolver={() => setDetalleId(null)} varianteHeader="compacto" soloLectura />;
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-start justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Seguimiento de pedidos</h2>
          <GuiaAyuda
            pantalla="Seguimiento de pedidos"
            pasos={[
              { titulo: "1 · Segmento HOY / HISTORIAL", texto: "HOY muestra solo lo de hoy. HISTORIAL con periodo hoy / ayer / semana / mes y todo al final." },
              { titulo: "2 · Buscador y filtros", texto: "Busca por cliente o consecutivo. Filtra por estado y por rango de fecha (Desde / Hasta) sin afectar el buscador." },
              { titulo: "3 · Consulta auditada", texto: "Toca un pedido para ver líneas, pagos recibidos y el historial de estados con nombres. Este panel es informativo: los estados y cobros se gestionan en Ventas." },
              { titulo: "4 · Comprobante y Excel", texto: "Adjunta foto o PDF del pago en el detalle. Usa Exportar Excel para descargar la tabla filtrada." },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportarPedidosCSV(pedidosFiltrados, (id) => obtenerCliente(id)?.nombre ?? id)}
            className="rounded-xl border border-line bg-paper-raised px-3 py-1.5 text-[11.5px] font-semibold text-ink active:bg-paper-sunken shadow-sm"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Segmento HOY | HISTORIAL y Filtros fijos */}
      <div className="flex-shrink-0 space-y-2 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-full border border-line bg-paper-raised p-1">
            <button
              type="button"
              onClick={() => setSegmento("hoy")}
              className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${segmento === "hoy" ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
            >
              HOY ({conteoHoy})
            </button>
            <button
              type="button"
              onClick={() => setSegmento("historial")}
              className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${segmento === "historial" ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
            >
              HISTORIAL ({pedidos.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMostrarFiltroFecha((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${mostrarFiltroFecha || fechaDesde || fechaHasta ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft active:bg-paper-sunken"}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            <span>Fechas {(fechaDesde || fechaHasta) && "· activo"}</span>
          </button>
        </div>

        {/* Periodo solo en historial */}
        {segmento === "historial" && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
            {(["hoy", "ayer", "semana", "mes", "todo"] as Periodo[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium capitalize transition-colors ${periodo === p ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Chips estado */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {(["todos", "pendiente", "en-preparacion", "entregado", "cancelado"] as FiltroEstado[]).map((estado) => (
            <button
              key={estado}
              type="button"
              onClick={() => setFiltroEstado(estado)}
              className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors ${filtroEstado === estado ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}
            >
              {estado === "todos" ? "Todos" : estado.replace("-", " ")}
            </button>
          ))}
        </div>

        {/* Buscador principal */}
        <input
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por cliente o consecutivo"
          className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />

        {/* Filtro fecha separado */}
        {mostrarFiltroFecha && (
          <div className="rounded-xl border border-line bg-paper-raised p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10.5px] font-semibold text-ink-soft">Desde</label>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="mt-0.5 w-full rounded-lg border border-line bg-paper px-2 py-1 text-[12px] text-ink focus:border-ink focus:outline-none" />
              </div>
              <div>
                <label className="text-[10.5px] font-semibold text-ink-soft">Hasta</label>
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="mt-0.5 w-full rounded-lg border border-line bg-paper px-2 py-1 text-[12px] text-ink focus:border-ink focus:outline-none" />
              </div>
            </div>
            {(fechaDesde || fechaHasta) && (
              <button type="button" onClick={() => { setFechaDesde(""); setFechaHasta(""); }} className="mt-1.5 text-[11px] font-semibold text-teal underline">
                Limpiar fechas
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Lista con scroll propio ─── */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Pedidos ({pedidosFiltrados.length})
            </p>
            <span className="text-[11px] text-ink-soft">Toca para ver el detalle</span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-2.5">
        {pedidosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-ink">No hay pedidos que coincidan con la búsqueda.</p>
          </div>
        ) : (
          paginar(pedidosFiltrados, pagina, POR_PAGINA).items.map((pedido) => {
            const cliente = obtenerCliente(pedido.clienteId);
            return (
              <article
                key={pedido.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetalleId(pedido.id)}
                onKeyDown={(e) => e.key === "Enter" && setDetalleId(pedido.id)}
                className="cursor-pointer rounded-xl border border-line bg-paper-raised p-3.5 text-left shadow-sm transition-shadow hover:shadow active:bg-paper-sunken"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-semibold text-ink-faint">{pedido.numero} · {formatoFechaHora(pedido.creadoEn)}</p>
                    <p className="mt-1 truncate text-[14px] font-semibold text-ink">{cliente?.nombre ?? "Cliente"} {cliente?.alias ? `“${cliente.alias}”` : ""}</p>
                    <p className="text-[12px] text-ink-soft">{pedido.lineas.length} referencias · {formatoMoneda(pedido.total)}</p>
                    <p className="text-[10.5px] text-ink-faint">Generó {nombreUsuario(pedido.vendedorId)}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <EtiquetaEstado estado={pedido.estado} />
                    <EtiquetaPago metodo={pedido.pago.metodo} pendiente={pedido.pago.saldoPendiente > 0} />
                  </div>
                </div>
                <p className="mt-2 text-[11.5px] font-semibold text-teal">Ver detalle informativo →</p>
              </article>
            );
          })
        )}
            </div>
          </div>
        </div>
      </div>

      {/* Paginación fija */}
      <div className="flex-shrink-0 mt-2">
        <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(pedidosFiltrados.length / POR_PAGINA))} total={pedidosFiltrados.length} porPagina={POR_PAGINA} onChange={setPagina} />
      </div>
    </div>
  );
}
