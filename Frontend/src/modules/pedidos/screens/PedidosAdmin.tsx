import { useEffect, useMemo, useState } from "react";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { SegmentoControl } from "../../../components/SegmentoControl";
import { TarjetaClicable } from "../../../components/TarjetaClicable";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { useOperaciones } from "../../../context/operaciones";
import type { EstadoPedido } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";
import { exportarPedidosCSV } from "../../../utils/exportar";
import { ETIQUETA_PERIODO, PERIODOS, dentroDePeriodo, dentroDeRangoFecha, esMismoDia, formatoFechaHora, type Periodo } from "../../../utils/fechas";
import { EtiquetaEstado } from "../../administracion/components/EtiquetaEstado";
import { EtiquetaPago } from "../../administracion/components/EtiquetaPago";
import { PedidoDetalle } from "../../ventas/screens/PedidoDetalle";

type Segmento = "hoy" | "historial";
type FiltroEstado = "todos" | EstadoPedido;

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
          <SegmentoControl
            valor={segmento}
            onChange={setSegmento}
            opciones={[
              { valor: "hoy", etiqueta: `HOY (${conteoHoy})` },
              { valor: "historial", etiqueta: `HISTORIAL (${pedidos.length})` },
            ]}
          />

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
          <SegmentoControl
            valor={periodo}
            onChange={setPeriodo}
            opciones={PERIODOS.map((p) => ({ valor: p, etiqueta: ETIQUETA_PERIODO[p] }))}
          />
        )}

        {/* Chips estado */}
        <SegmentoControl
          valor={filtroEstado}
          onChange={setFiltroEstado}
          opciones={[
            { valor: "todos", etiqueta: "Todos" },
            { valor: "pendiente", etiqueta: "Pendiente" },
            { valor: "en-preparacion", etiqueta: "En preparación" },
            { valor: "entregado", etiqueta: "Entregado" },
            { valor: "cancelado", etiqueta: "Cancelado" },
          ]}
        />

        <BuscadorInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por cliente o consecutivo" />

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
          <ListaVacia titulo="No hay pedidos que coincidan con la búsqueda." texto="Ajusta el segmento, el estado o el rango de fechas." />
        ) : (
          paginar(pedidosFiltrados, pagina, POR_PAGINA).items.map((pedido) => {
            const cliente = obtenerCliente(pedido.clienteId);
            return (
              <TarjetaClicable key={pedido.id} onClick={() => setDetalleId(pedido.id)} className="p-3.5">
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
              </TarjetaClicable>
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
