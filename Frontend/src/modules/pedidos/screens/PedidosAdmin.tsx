import { useEffect, useMemo, useState } from "react";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { SegmentoControl } from "../../../components/SegmentoControl";
import { TarjetaClicable } from "../../../components/TarjetaClicable";
import { useTamanoPagina, paginar } from "../../../utils/paginacion";
import { useOperaciones } from "../../../context/operaciones";
import type { EstadoPedido, Pedido } from "../../../types";
import { usePaginaApi, useRegistroApi } from "../../../data/usePaginaApi";
import { formatoMoneda } from "../../../utils/formato";
import { exportarPedidosCSV } from "../../../utils/exportar";
import { ETIQUETA_PERIODO, PERIODOS, dentroDePeriodo, dentroDeRangoFecha, esMismoDia, formatoFechaHora, type Periodo } from "../../../utils/fechas";
import { EtiquetaEstado } from "../../administracion/components/EtiquetaEstado";
import { EtiquetaPago } from "../../administracion/components/EtiquetaPago";
import { PedidoDetalle } from "../../ventas/screens/PedidoDetalle";
import { usaApi, baseApi, listaApi } from "../../../data/api";
import { fechaOperativa } from "../../../utils/fechas";

type Segmento = "hoy" | "historial";
type FiltroEstado = "todos" | EstadoPedido;

export function PedidosAdmin() {
  const POR_PAGINA = useTamanoPagina();
  const { pedidos, obtenerCliente, actualizarEstadoPedido } = useOperaciones();
  const [segmento, setSegmento] = useState<Segmento>("historial");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarFiltroFecha, setMostrarFiltroFecha] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState("");
  const consulta = new URLSearchParams({ segmento, estado: filtroEstado, q: busqueda.trim(), page: String(pagina), pageSize: String(POR_PAGINA) });
  const fechaISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  let desdePeriodo = "";
  let hastaPeriodo = "";
  if (segmento === "historial" && periodo !== "todo") {
    const inicio = new Date();
    const fin = new Date(inicio);
    const dias = { hoy: 0, ayer: 1, semana: 6, mes: 29, anio: 364 }[periodo];
    inicio.setDate(inicio.getDate() - dias);
    if (periodo === "ayer") fin.setDate(fin.getDate() - 1);
    desdePeriodo = fechaISO(inicio); hastaPeriodo = fechaISO(fin);
  }
  const desde = [desdePeriodo, fechaDesde].filter(Boolean).sort().at(-1);
  const hasta = [hastaPeriodo, fechaHasta].filter(Boolean).sort().at(0);
  if (desde) consulta.set("desde", desde);
  if (hasta) consulta.set("hasta", hasta);
  const remoto = usePaginaApi<Pedido>(`/pedidos?${consulta.toString()}`);
  const pedidosVisibles = usaApi ? remoto.items.map((p) => ({ ...p, comprobantePagoUrl: p.comprobantePagoAdjuntoId ? `${baseApi}/archivos/${p.comprobantePagoAdjuntoId}` : undefined })) : pedidos;

  const hoy = useMemo(() => new Date(), []);

  useEffect(() => { setPagina(1); }, [segmento, periodo, filtroEstado, busqueda, fechaDesde, fechaHasta]);
  const detalleRemoto=useRegistroApi<Pedido>(`/pedidos/${detalleId}`,!!detalleId);
  const pedidoDetalle = usaApi ? detalleRemoto.data ?? null : pedidosVisibles.find((p) => p.id === detalleId) ?? null;

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (usaApi) return remoto.items;
    return pedidos
      .filter((pedido) => {
        if (segmento === "hoy" && !esMismoDia(fechaOperativa(pedido), hoy)) return false;
        if (segmento === "historial" && !dentroDePeriodo(fechaOperativa(pedido), periodo, hoy)) return false;
        if (!dentroDeRangoFecha(fechaOperativa(pedido), fechaDesde, fechaHasta)) return false;
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
  }, [busqueda, fechaDesde, fechaHasta, filtroEstado, hoy, obtenerCliente, pedidos, periodo, segmento, remoto.items]);

  async function exportar() {
    setExportando(true); setErrorExportacion("");
    try {
      const filtros = new URLSearchParams(consulta);
      filtros.delete("page"); filtros.delete("pageSize");
      const filas = usaApi ? await listaApi<Pedido>(`/pedidos?${filtros}`) : pedidosFiltrados;
      const nombres = new Map(filas.map(p => [p.clienteId, p.clienteNombre]));
      exportarPedidosCSV(filas, id => nombres.get(id) ?? obtenerCliente(id)?.nombre ?? id);
    } catch (e) { setErrorExportacion(e instanceof Error ? e.message : "No se pudo exportar. Intenta de nuevo."); }
    finally { setExportando(false); }
  }

  // El detalle es informativo: los estados y cobros se gestionan en Ventas.
  // La única acción administrativa es reactivar un pedido cancelado.
  const estadoAnteriorDelDetalle = useMemo(() => {
    if (!pedidoDetalle) return "pendiente" as EstadoPedido;
    const historial = pedidoDetalle.historialEstados;
    for (let i = historial.length - 1; i >= 0; i -= 1) {
      if (historial[i].estado !== "cancelado") return historial[i].estado;
    }
    return "pendiente" as EstadoPedido;
  }, [pedidoDetalle]);

  if (detalleId && usaApi && !pedidoDetalle) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p role={detalleRemoto.error ? "alert" : "status"} className="text-[13.5px] text-ink">
          {detalleRemoto.error ? "No se pudo cargar el detalle del pedido. Tus datos siguen guardados." : "Cargando pedido…"}
        </p>
        {detalleRemoto.error && <button type="button" onClick={() => void detalleRemoto.refetch()} className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">Reintentar</button>}
        <button type="button" onClick={() => setDetalleId(null)} className="text-[13px] font-semibold text-ink">Volver al historial</button>
      </div>
    );
  }

  if (pedidoDetalle) {
    return (
      <PedidoDetalle
        pedido={pedidoDetalle}
        onVolver={() => setDetalleId(null)}
        varianteHeader="compacto"
        soloLectura
        alReactivar={
          !usaApi && pedidoDetalle.estado === "cancelado"
            ? () => actualizarEstadoPedido(pedidoDetalle.id, estadoAnteriorDelDetalle)
            : undefined
        }
      />
    );
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
              { titulo: "3 · Consulta auditada", texto: "Toca un pedido para ver líneas, pagos recibidos y el historial de estados con nombres. Los estados y cobros se gestionan en Ventas; un pedido cancelado se puede reactivar aquí mismo." },
              { titulo: "4 · Comprobante y Excel", texto: "Adjunta foto o PDF del pago en el detalle. Usa Exportar Excel para descargar la tabla filtrada." },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exportando || (usaApi && (remoto.cargando || remoto.actualizando))}
            onClick={() => void exportar()}
            className="rounded-xl border border-line bg-paper-raised px-3 py-1.5 text-[11.5px] font-semibold text-ink active:bg-paper-sunken shadow-sm"
          >
            {exportando ? "Preparando…" : "Exportar Excel"}
          </button>
        </div>
      </div>
      {errorExportacion && <p role="alert" className="text-danger">{errorExportacion}</p>}

      {/* Segmento HOY | HISTORIAL y Filtros fijos */}
      <div className="flex-shrink-0 space-y-2 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <SegmentoControl
            valor={segmento}
            onChange={setSegmento}
            opciones={[
              { valor: "hoy", etiqueta: "HOY" },
              { valor: "historial", etiqueta: "HISTORIAL" },
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

      <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil((usaApi ? remoto.total : pedidosFiltrados.length) / POR_PAGINA))} total={usaApi ? remoto.total : pedidosFiltrados.length} porPagina={POR_PAGINA} onChange={setPagina} />
      <p role="status" className="shrink-0 text-center text-[11px] text-ink-soft">{usaApi ? remoto.total : pedidosFiltrados.length} pedidos · {segmento === "hoy" ? "Solo hoy" : periodo === "todo" && !fechaDesde && !fechaHasta ? "Historial completo" : "Historial filtrado"}</p>

      {/* ─── Lista con scroll propio ─── */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        {usaApi && remoto.cargando && <p role="status">Cargando pedidos…</p>}
        {usaApi && remoto.actualizando && <p role="status" className="shrink-0 text-xs text-ink-soft">Actualizando filtro; se conserva la página anterior…</p>}
        {usaApi && remoto.error && <p role="alert" className="text-danger">{remoto.error} <button onClick={remoto.actualizar}>Reintentar</button></p>}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Pedidos
            </p>
            <span className="text-[11px] text-ink-soft">Toca para ver el detalle</span>
          </div>
          <div inert={usaApi && (remoto.actualizando)} className="lista-datos lista-pedidos no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-1.5">
        {pedidosFiltrados.length === 0 ? (
          <ListaVacia titulo="No hay pedidos que coincidan con la búsqueda." texto="Ajusta el segmento, el estado o el rango de fechas." />
        ) : (
          (usaApi ? pedidosFiltrados : paginar(pedidosFiltrados, pagina, POR_PAGINA).items).map((pedido) => {
            const cliente = obtenerCliente(pedido.clienteId);
            return (
              <TarjetaClicable key={pedido.id} onClick={() => { if (!remoto.actualizando) setDetalleId(pedido.id); }} className="!px-3 !py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{cliente?.nombre ?? pedido.clienteNombre ?? "Venta ocasional"}</p>
                    <p className="truncate font-mono text-[10.5px] text-ink-faint">{pedido.numero} · {formatoFechaHora(pedido.creadoEn)}</p>
                    <p className="text-[12px] font-semibold text-ink">{formatoMoneda(pedido.total)}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <EtiquetaEstado estado={pedido.estado} compacta />
                    <EtiquetaPago metodo={pedido.pago.metodo} pendiente={pedido.pago.saldoPendiente > 0} compacta />
                  </div>
                </div>
              </TarjetaClicable>
            );
          })
        )}
            </div>
          </div>
        </div>
      </div>

      {/* Paginación fija */}

    </div>
  );
}
