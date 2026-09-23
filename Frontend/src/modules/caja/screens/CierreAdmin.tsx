import { useEffect, useMemo, useState } from "react";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { IconArrowLeft, IconCheck, IconChevronRight, IconLock } from "../../../components/Icons";
import { Paginacion, POR_PAGINA, paginar } from "../../../components/Paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useAuth } from "../../../context/AuthContext";
import { useOperaciones } from "../../../context/OperacionesContext";
import { cargarCierres, guardarCierres } from "../../../data/repositorios/cierres";
import { nuevoId } from "../../../data/repositorios/almacenamiento";
import type { CierreDia } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

type PeriodoCierre = "hoy" | "ayer" | "semana" | "mes" | "todo";
type FiltroPagoCierre = "todos" | "credito" | "efectivo" | "nequi";

function esHoy(iso: string, hoy: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
}

function esAyer(iso: string, hoy: Date): boolean {
  const d = new Date(iso);
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  return d.getFullYear() === ayer.getFullYear() && d.getMonth() === ayer.getMonth() && d.getDate() === ayer.getDate();
}

function dentroDePeriodo(fechaStr: string, periodo: PeriodoCierre, hoy: Date): boolean {
  if (periodo === "todo") return true;
  if (periodo === "hoy") {
    const [yh, mh, dh] = fechaStr.split("-").map(Number);
    return yh === hoy.getFullYear() && mh === hoy.getMonth() + 1 && dh === hoy.getDate();
  }
  const [y, m, d] = fechaStr.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const copiaHoy = new Date(hoy);
  copiaHoy.setHours(0, 0, 0, 0);
  if (periodo === "ayer") {
    const ayer = new Date(copiaHoy);
    ayer.setDate(ayer.getDate() - 1);
    return fecha.getFullYear() === ayer.getFullYear() && fecha.getMonth() === ayer.getMonth() && fecha.getDate() === ayer.getDate();
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

function dentroDeRangoFecha(fechaStr: string, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  if (desde && fechaStr < desde) return false;
  if (hasta && fechaStr > hasta) return false;
  return true;
}

/** Fecha local YYYY-MM-DD (sin desfase UTC). */
function fechaLocalStr(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CierreAdmin() {
  const { movimientosCaja, pedidos, obtenerCliente, actualizarEstadoPedido, trasladarPedidoAHoy } = useOperaciones();
  const { usuario } = useAuth();
  const [cierres, setCierres] = useState<CierreDia[]>(cargarCierres);

  // Vistas y pasos: "historial" (por defecto) o "cierre" (paso 1: conteo, paso 2: resumen)
  const [vista, setVista] = useState<"historial" | "cierre">("historial");
  const [pasoCierre, setPasoCierre] = useState<1 | 2>(1);

  // Inputs del conteo
  const [conteoEfectivo, setConteoEfectivo] = useState("");
  const [conteoNequi, setConteoNequi] = useState("");

  // Histórico: filtros y paginación
  const [periodo, setPeriodo] = useState<PeriodoCierre>("hoy");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarFiltroFecha, setMostrarFiltroFecha] = useState(false);
  const [pagina, setPagina] = useState(1);

  // Pendientes en paso 1
  const [busquedaPend, setBusquedaPend] = useState("");
  const [filtroPago, setFiltroPago] = useState<FiltroPagoCierre>("todos");
  const [mostrarPendientes, setMostrarPendientes] = useState(false);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  const hoy = useMemo(() => new Date(), []);
  const fechaHoyStr = fechaLocalStr(hoy);

  // Cálculos de la jornada de hoy
  const movsHoy = useMemo(() => movimientosCaja.filter((m) => esHoy(m.creadoEn, hoy)), [hoy, movimientosCaja]);
  const ingresosHoy = movsHoy.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const egresosHoy = movsHoy.filter((m) => m.tipo === "egreso").reduce((s, m) => s + m.monto, 0);
  const efectivoEsperado = movsHoy.filter((m) => m.tipo === "ingreso" && m.metodo === "efectivo").reduce((s, m) => s + m.monto, 0);
  const nequiEsperado = movsHoy.filter((m) => m.tipo === "ingreso" && m.metodo === "nequi").reduce((s, m) => s + m.monto, 0);
  const balanceHoy = ingresosHoy - egresosHoy;

  const pedidosHoy = useMemo(() => pedidos.filter((p) => esHoy(p.creadoEn, hoy) && p.estado !== "cancelado"), [hoy, pedidos]);
  const ventasHoy = pedidosHoy.reduce((s, p) => s + p.total, 0);

  // Ventas discriminadas por forma de pago
  const pedidosEfectivoHoy = useMemo(() => pedidosHoy.filter((p) => p.pago.metodo === "efectivo" && p.pago.saldoPendiente === 0), [pedidosHoy]);
  const ventasEfectivoHoy = pedidosEfectivoHoy.reduce((s, p) => s + p.total, 0);

  const pedidosNequiHoy = useMemo(() => pedidosHoy.filter((p) => p.pago.metodo === "nequi" && p.pago.saldoPendiente === 0), [pedidosHoy]);
  const ventasNequiHoy = pedidosNequiHoy.reduce((s, p) => s + p.total, 0);

  const pedidosCreditoHoy = useMemo(() => pedidosHoy.filter((p) => p.pago.saldoPendiente > 0), [pedidosHoy]);
  const ventasCreditoHoy = pedidosCreditoHoy.reduce((s, p) => s + p.pago.saldoPendiente, 0);

  // Pendientes de hoy y ayer
  const pendientesHoy = useMemo(
    () => pedidos.filter((p) => (esHoy(p.creadoEn, hoy) || esAyer(p.creadoEn, hoy)) && (p.estado === "pendiente" || p.estado === "en-preparacion")),
    [hoy, pedidos],
  );
  const pendientesAyer = useMemo(() => pendientesHoy.filter((p) => esAyer(p.creadoEn, hoy)), [hoy, pendientesHoy]);

  const conteoEfNum = conteoEfectivo === "" ? null : Number(conteoEfectivo);
  const conteoNeqNum = conteoNequi === "" ? null : Number(conteoNequi);
  const difEfectivo = conteoEfNum === null ? null : conteoEfNum - efectivoEsperado;
  const difNequi = conteoNeqNum === null ? null : conteoNeqNum - nequiEsperado;

  const yaCerradoHoy = cierres.some((c) => c.fecha === fechaHoyStr);

  const cierresFiltrados = useMemo(
    () =>
      cierres
        .filter((c) => {
          if (periodo === "hoy" && !(c.fecha === fechaHoyStr || esHoy(c.creadoEn, hoy))) return false;
          if (periodo !== "hoy" && !dentroDePeriodo(c.fecha, periodo, hoy)) return false;
          if (!dentroDeRangoFecha(c.fecha, fechaDesde, fechaHasta)) return false;
          return true;
        })
        .sort((a, b) => (b.fecha < a.fecha ? -1 : b.fecha > a.fecha ? 1 : b.creadoEn < a.creadoEn ? -1 : 1)),
    [cierres, fechaDesde, fechaHasta, fechaHoyStr, hoy, periodo],
  );

  useEffect(() => { setPagina(1); }, [periodo, fechaDesde, fechaHasta]);

  const pendientesFiltrados = useMemo(() => {
    const q = busquedaPend.trim().toLowerCase();
    return pendientesHoy.filter((pedido) => {
      if (filtroPago === "credito" && !(pedido.pago.saldoPendiente > 0)) return false;
      if (filtroPago === "efectivo" && !(pedido.pago.metodo === "efectivo" && pedido.pago.saldoPendiente === 0)) return false;
      if (filtroPago === "nequi" && !(pedido.pago.metodo === "nequi" && pedido.pago.saldoPendiente === 0)) return false;
      if (!q) return true;
      const cliente = obtenerCliente(pedido.clienteId);
      return (
        pedido.numero.toLowerCase().includes(q) ||
        cliente?.nombre.toLowerCase().includes(q) ||
        cliente?.alias.toLowerCase().includes(q)
      );
    });
  }, [busquedaPend, filtroPago, obtenerCliente, pendientesHoy]);

  function iniciarNuevoCierre() {
    setPasoCierre(1);
    setVista("cierre");
  }

  function confirmarCierreFinal() {
    const cierre: CierreDia = {
      id: nuevoId(),
      fecha: fechaHoyStr,
      usuarioId: usuario?.id ?? "sistema",
      totalVentas: ventasHoy,
      totalIngresos: ingresosHoy,
      totalEgresos: egresosHoy,
      pedidosCount: pedidosHoy.length,
      pendientesTrasladados: 0,
      pendientesCancelados: 0,
      conteoEfectivo: conteoEfNum ?? undefined,
      conteoNequi: conteoNeqNum ?? undefined,
      diferenciaEfectivo: difEfectivo ?? undefined,
      diferenciaNequi: difNequi ?? undefined,
      creadoEn: new Date().toISOString(),
    };
    const siguientes = [cierre, ...cierres];
    guardarCierres(siguientes);
    setCierres(siguientes);

    // Al confirmar, vuelve automáticamente al historial
    setVista("historial");
    setPasoCierre(1);
    setPeriodo("hoy");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO PASO A PASO: CIERRE (Paso 1: Conteo, Paso 2: Resumen)
  // ══════════════════════════════════════════════════════════════════════════
  if (vista === "cierre") {
    return (
      <div className="flex h-full flex-col min-h-0">
        {/* Cabecera del paso con volver y progreso */}
        <div className="flex-shrink-0 flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (pasoCierre === 2) setPasoCierre(1);
                else setVista("historial");
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-raised border border-line text-ink active:bg-paper-sunken"
              aria-label="Volver"
            >
              <IconArrowLeft width={18} height={18} />
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                {pasoCierre === 1 ? "Paso 1 de 2 · Conteo de dinero" : "Paso 2 de 2 · Resumen y confirmación"}
              </p>
              <h2 className="font-display text-[17px] font-semibold text-ink">
                {pasoCierre === 1 ? "Conteo físico del día" : "Resumen del cierre de hoy"}
              </h2>
            </div>
          </div>
          <span className="rounded-full bg-ink px-3 py-1 font-mono text-[11px] font-semibold text-white">
            {pasoCierre} / 2
          </span>
        </div>

        {/* ─── PASO 1: CONTEO FÍSICO DE EFECTIVO Y NEQUI ─── */}
        {pasoCierre === 1 && (
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-3 space-y-3.5 max-w-xl">
            {/* Banner de expectativas del sistema */}
            <div className="rounded-2xl bg-ink p-4 text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-white/70">Fecha: {fechaHoyStr}</span>
                <span className="font-mono text-[12px] text-accent">{pedidosHoy.length} pedidos hoy</span>
              </div>
              <p className="mt-1 font-mono text-2xl font-bold">{formatoMoneda(balanceHoy)}</p>
              <p className="text-[11.5px] text-white/70">Balance esperado en caja (Ingresos {formatoMoneda(ingresosHoy)} − Egresos {formatoMoneda(egresosHoy)})</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-[10.5px] text-white/60">Efectivo esperado</p>
                  <p className="mt-0.5 font-mono text-[15px] font-semibold text-white">{formatoMoneda(efectivoEsperado)}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-[10.5px] text-white/60">Nequi esperado</p>
                  <p className="mt-0.5 font-mono text-[15px] font-semibold text-white">{formatoMoneda(nequiEsperado)}</p>
                </div>
              </div>
            </div>

            {/* Formulario de conteo */}
            <div className="rounded-2xl border border-line bg-paper-raised p-4">
              <p className="font-display text-[14.5px] font-semibold text-ink">Ingreso de dinero contado</p>
              <p className="mt-0.5 text-[12px] text-ink-soft">Digita el dinero físico y el saldo Nequi recibido hoy.</p>

              <div className="mt-3.5 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      Efectivo contado físico ($)
                    </label>
                    <span className="text-[11.5px] text-ink-soft">Esperado: {formatoMoneda(efectivoEsperado)}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={conteoEfectivo}
                    onChange={(e) => setConteoEfectivo(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3.5 py-3 font-mono text-[16px] font-semibold text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11.5px] font-semibold">
                    <span className="text-ink-faint">Diferencia efectivo:</span>
                    <span className={difEfectivo === null ? "text-ink-faint" : difEfectivo === 0 ? "text-success" : "text-danger"}>
                      {difEfectivo === null ? "Sin ingresar" : difEfectivo === 0 ? "✓ Cuadra exacto" : `Diferencia ${difEfectivo > 0 ? "+" : ""}${formatoMoneda(difEfectivo)}`}
                    </span>
                  </div>
                </div>

                <div className="border-t border-line/60 pt-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      Nequi confirmado ($)
                    </label>
                    <span className="text-[11.5px] text-ink-soft">Esperado: {formatoMoneda(nequiEsperado)}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={conteoNequi}
                    onChange={(e) => setConteoNequi(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3.5 py-3 font-mono text-[16px] font-semibold text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11.5px] font-semibold">
                    <span className="text-ink-faint">Diferencia Nequi:</span>
                    <span className={difNequi === null ? "text-ink-faint" : difNequi === 0 ? "text-success" : "text-danger"}>
                      {difNequi === null ? "Sin ingresar" : difNequi === 0 ? "✓ Cuadra exacto" : `Diferencia ${difNequi > 0 ? "+" : ""}${formatoMoneda(difNequi)}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pendientes (opcional colapsable para no cansar la pantalla) */}
            {pendientesHoy.length > 0 && (
              <div className="rounded-2xl border border-line bg-paper-raised p-3.5">
                <button
                  type="button"
                  onClick={() => setMostrarPendientes((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Pendientes por resolver ({pendientesHoy.length})
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      {pendientesAyer.length > 0 ? `${pendientesAyer.length} de ayer pendientes de traslado` : "Todos son de hoy"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-paper-sunken px-2.5 py-1 text-[11px] font-semibold text-ink">
                    {mostrarPendientes ? "Ocultar" : "Revisar"}
                  </span>
                </button>

                {mostrarPendientes && (
                  <div className="mt-3 space-y-2 border-t border-line/60 pt-2.5">
                    <input
                      value={busquedaPend}
                      onChange={(e) => setBusquedaPend(e.target.value)}
                      placeholder="Buscar pendiente por # o cliente"
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                    />
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {(["todos", "credito", "efectivo", "nequi"] as FiltroPagoCierre[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFiltroPago(f)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                            filtroPago === f ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink-soft"
                          }`}
                        >
                          {f === "todos" ? "Todos" : f === "credito" ? "Crédito" : f}
                        </button>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-line bg-paper-sunken/40">
                      <div className="flex items-center justify-between border-b border-line bg-paper-raised px-3 py-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                          Pendientes ({pendientesFiltrados.length})
                        </p>
                        <span className="text-[10.5px] text-ink-soft">Traslada o elimina</span>
                      </div>
                      <ul className="no-scrollbar max-h-48 space-y-2 overflow-y-auto p-2">
                      {pendientesFiltrados.length === 0 && (
                        <li className="rounded-xl border border-dashed border-line bg-paper p-4 text-center text-[12px] text-ink-soft">
                          Sin pendientes para este filtro.
                        </li>
                      )}
                      {pendientesFiltrados.map((pedido) => {
                        const cliente = obtenerCliente(pedido.clienteId);
                        const deAyer = esAyer(pedido.creadoEn, hoy);
                        const esCred = pedido.pago.saldoPendiente > 0;
                        return (
                          <li key={pedido.id} className="rounded-xl border border-line bg-paper p-2.5 text-[12px]">
                            <div className="flex items-start justify-between">
                              <span className="font-semibold text-ink">{pedido.numero} · {cliente?.alias || cliente?.nombre}</span>
                              <span className="font-mono font-semibold text-ink">{formatoMoneda(pedido.total)}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-ink-soft">
                              <span>{esCred ? "Crédito pendiente" : pedido.pago.metodo} {deAyer ? "· Ayer" : "· Hoy"}</span>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    trasladarPedidoAHoy(pedido.id);
                                    mostrarAviso(`${pedido.numero} pasa a mañana`, "exito");
                                  }}
                                  className="rounded bg-ink px-2 py-0.5 text-[10.5px] font-medium text-white"
                                >
                                  Pasar para mañana
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmarEliminarId(pedido.id)}
                                  className="rounded bg-danger-soft px-2 py-0.5 text-[10.5px] font-medium text-danger"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botón hacia el paso 2 */}
            <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setPasoCierre(2)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-[14px] font-semibold text-white active:bg-ink/90 shadow-sm"
              >
                <span>Continuar al resumen de hoy</span>
                <IconChevronRight width={17} height={17} />
              </button>
            </div>
          </div>
        )}

        {/* ─── PASO 2: RESUMEN DE LA FECHA DE HOY Y CONFIRMACIÓN ─── */}
        {pasoCierre === 2 && (
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-3 space-y-3.5 max-w-xl">
            <div className="rounded-2xl border border-line bg-paper-raised p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Resumen de ventas de hoy ({fechaHoyStr})
              </p>
              <h3 className="mt-1 font-display text-[18px] font-bold text-ink">
                Total ventas: {formatoMoneda(ventasHoy)}
              </h3>
              <p className="text-[12px] text-ink-soft">{pedidosHoy.length} pedidos registrados hoy</p>

              {/* Desglose: efectivo, nequi, crédito */}
              <div className="mt-3.5 grid gap-2.5">
                <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success-soft/40 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-white font-mono text-[13px] font-bold">
                      $
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-ink">Ventas en Efectivo</p>
                      <p className="text-[11px] text-ink-soft">{pedidosEfectivoHoy.length} pedidos cobrados</p>
                    </div>
                  </div>
                  <span className="font-mono text-[16px] font-bold text-success">
                    {formatoMoneda(ventasEfectivoHoy)}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-teal/30 bg-teal-soft/40 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-white font-mono text-[13px] font-bold">
                      N
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-ink">Ventas en Nequi</p>
                      <p className="text-[11px] text-ink-soft">{pedidosNequiHoy.length} transferencias</p>
                    </div>
                  </div>
                  <span className="font-mono text-[16px] font-bold text-teal">
                    {formatoMoneda(ventasNequiHoy)}
                  </span>
                </div>

                <div className={`flex items-center justify-between rounded-xl border p-3 ${
                  ventasCreditoHoy > 0 ? "border-danger/30 bg-danger-soft/40" : "border-line bg-paper"
                }`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] font-bold ${
                      ventasCreditoHoy > 0 ? "bg-danger text-white" : "bg-paper-sunken text-ink-faint"
                    }`}>
                      C
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-ink">Ventas a Crédito</p>
                      <p className="text-[11px] text-ink-soft">
                        {pedidosCreditoHoy.length > 0 ? `${pedidosCreditoHoy.length} pedidos con saldo pendiente` : "Sin créditos hoy"}
                      </p>
                    </div>
                  </div>
                  <span className={`font-mono text-[16px] font-bold ${ventasCreditoHoy > 0 ? "text-danger" : "text-ink-faint"}`}>
                    {formatoMoneda(ventasCreditoHoy)}
                  </span>
                </div>
              </div>
            </div>

            {/* Comparativa del conteo ingresado */}
            <div className="rounded-2xl border border-line bg-paper-raised p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Validación del cuadre
              </p>
              <div className="mt-2.5 space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between rounded-lg bg-paper p-2.5">
                  <span className="text-ink-soft">Efectivo contado:</span>
                  <span className="font-mono font-semibold text-ink">
                    {conteoEfNum !== null ? formatoMoneda(conteoEfNum) : "Sin ingresar"} ·{" "}
                    <span className={difEfectivo === 0 ? "text-success" : "text-danger"}>
                      {difEfectivo === 0 ? "Cuadra ✓" : `Dif: ${difEfectivo ? (difEfectivo > 0 ? "+" : "") + formatoMoneda(difEfectivo) : "—"}`}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-paper p-2.5">
                  <span className="text-ink-soft">Nequi verificado:</span>
                  <span className="font-mono font-semibold text-ink">
                    {conteoNeqNum !== null ? formatoMoneda(conteoNeqNum) : "Sin ingresar"} ·{" "}
                    <span className={difNequi === 0 ? "text-success" : "text-danger"}>
                      {difNequi === 0 ? "Cuadra ✓" : `Dif: ${difNequi ? (difNequi > 0 ? "+" : "") + formatoMoneda(difNequi) : "—"}`}
                    </span>
                  </span>
                </div>
              </div>

              {yaCerradoHoy && (
                <p className="mt-3 rounded-xl bg-accent-soft p-2.5 text-center text-[12px] font-medium text-accent-dark">
                  Nota: Ya existe un cierre registrado para hoy. Si confirmas, se asentará este nuevo registro actualizado.
                </p>
              )}
            </div>

            {/* Acciones de confirmación */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPasoCierre(1)}
                className="rounded-xl border border-line bg-paper-raised py-3.5 text-[13.5px] font-semibold text-ink active:bg-paper-sunken"
              >
                ← Corregir conteo
              </button>
              <button
                type="button"
                onClick={confirmarCierreFinal}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-ink py-3.5 text-[13.5px] font-semibold text-white active:bg-ink/90 shadow-sm"
              >
                <IconCheck width={17} height={17} />
                <span>Confirmar cierre</span>
              </button>
            </div>
          </div>
        )}

        <ConfirmarAccion
          abierto={confirmarEliminarId !== null}
          titulo="Eliminar pendiente"
          mensaje={`Se eliminará ${pendientesHoy.find((p) => p.id === confirmarEliminarId)?.numero ?? "el pedido"} del cierre. Esta acción queda auditada.`}
          textoConfirmar="Sí, eliminar"
          tono="peligro"
          alCancelar={() => setConfirmarEliminarId(null)}
          alConfirmar={() => {
            if (confirmarEliminarId) {
              const numero = pendientesHoy.find((p) => p.id === confirmarEliminarId)?.numero ?? "";
              actualizarEstadoPedido(confirmarEliminarId, "cancelado");
              setConfirmarEliminarId(null);
              mostrarAviso(`${numero} eliminado del cierre`, "exito");
            }
          }}
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA POR DEFECTO: HISTORIAL GENERAL DE CIERRES (con scroll interno)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-full flex-col min-h-0">
      {/* ─── Cabecera fija: Título + Guía + Botón de nuevo cierre en la misma línea ─── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <IconLock width={20} height={20} className="text-ink" />
          <h2 className="font-display text-[18px] font-semibold text-ink">Validación y Cierre</h2>
          <GuiaAyuda
            pantalla="Validación y Cierre"
            pasos={[
              { titulo: "1 · Historial general", texto: "Revisa aquí todos los cierres diarios con ventas, ingresos, egresos y cuadre." },
              { titulo: "2 · Hacer Cierre", texto: "Toca el botón 'Hacer Cierre' para iniciar el flujo guiado en 2 pasos: primero digitas efectivo y Nequi, luego revisas el resumen de hoy y confirmas." },
              { titulo: "3 · Filtros", texto: "Usa los botones de periodo (hoy, ayer, semana, mes, todo) y el filtro de fecha para auditar días específicos." },
            ]}
          />
        </div>

        {/* Botón principal de cierre en la misma línea */}
        <button
          type="button"
          onClick={iniciarNuevoCierre}
          className="flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white active:bg-ink/90 shadow-sm"
        >
          <span>+ Hacer Cierre</span>
        </button>
      </div>

      {/* ─── Filtros de periodo y rango de fecha (fijos) ─── */}
      <div className="flex-shrink-0 mt-3 flex items-center justify-between gap-2">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {(["hoy", "ayer", "semana", "mes", "todo"] as PeriodoCierre[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                periodo === p ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft active:bg-paper-sunken"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMostrarFiltroFecha((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
            mostrarFiltroFecha || fechaDesde || fechaHasta
              ? "border-ink bg-ink text-white"
              : "border-line bg-paper-raised text-ink-soft active:bg-paper-sunken"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          <span>Fechas {(fechaDesde || fechaHasta) && "· filtro"}</span>
        </button>
      </div>

      {/* Rango de fechas desplegable */}
      {mostrarFiltroFecha && (
        <div className="flex-shrink-0 mt-2 rounded-xl border border-line bg-paper-raised p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-soft">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px] text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-soft">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px] text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>
          {(fechaDesde || fechaHasta) && (
            <button
              type="button"
              onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
              className="mt-2 text-[11.5px] font-semibold text-teal underline"
            >
              Limpiar filtro de fechas
            </button>
          )}
        </div>
      )}

      {/* ─── Lista con scroll propio ─── */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Cierres ({cierresFiltrados.length})
            </p>
            <span className="text-[11px] text-ink-soft">Recientes primero</span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-2.5">
        {cierresFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-12 text-center">
            <p className="text-[13.5px] font-medium text-ink">No hay cierres para este filtro</p>
            <p className="mt-1 text-[12px] text-ink-soft">
              Toca &ldquo;+ Hacer Cierre&rdquo; para registrar el cierre de la jornada.
            </p>
            <button
              type="button"
              onClick={iniciarNuevoCierre}
              className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12.5px] font-semibold text-white"
            >
              Hacer cierre de hoy
            </button>
          </div>
        ) : (
          paginar(cierresFiltrados, pagina, POR_PAGINA).items.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm transition-shadow hover:shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[13px] font-bold text-ink">{c.fecha}</p>
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
                      Cerrado
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-semibold text-ink">
                    {c.pedidosCount} pedidos · Ventas {formatoMoneda(c.totalVentas)}
                  </p>
                  <p className="text-[12px] text-ink-soft">
                    Ingresos {formatoMoneda(c.totalIngresos)} − Egresos {formatoMoneda(c.totalEgresos)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[14px] font-bold text-ink">
                    {formatoMoneda(c.totalIngresos - c.totalEgresos)}
                  </p>
                  <p className="text-[10px] uppercase text-ink-faint">Balance neto</p>
                </div>
              </div>

              {(c.conteoEfectivo !== undefined || c.conteoNequi !== undefined) && (
                <div className="mt-2.5 rounded-lg bg-paper-sunken/60 p-2 text-[11.5px] text-ink-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Contado: Efectivo {c.conteoEfectivo !== undefined ? formatoMoneda(c.conteoEfectivo) : "—"} · Nequi{" "}
                      {c.conteoNequi !== undefined ? formatoMoneda(c.conteoNequi) : "—"}
                    </span>
                    {(c.diferenciaEfectivo !== undefined || c.diferenciaNequi !== undefined) && (
                      <span className="font-semibold">
                        Dif: Ef {c.diferenciaEfectivo !== undefined ? (c.diferenciaEfectivo === 0 ? "✓ 0" : (c.diferenciaEfectivo > 0 ? "+" : "") + formatoMoneda(c.diferenciaEfectivo)) : "—"}{" "}
                        / Nq {c.diferenciaNequi !== undefined ? (c.diferenciaNequi === 0 ? "✓ 0" : (c.diferenciaNequi > 0 ? "+" : "") + formatoMoneda(c.diferenciaNequi)) : "—"}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Paginación fija al pie ─── */}
      <div className="flex-shrink-0 mt-2">
        <Paginacion
          pagina={pagina}
          totalPaginas={Math.max(1, Math.ceil(cierresFiltrados.length / POR_PAGINA))}
          total={cierresFiltrados.length}
          porPagina={POR_PAGINA}
          onChange={setPagina}
        />
      </div>
    </div>
  );
}
