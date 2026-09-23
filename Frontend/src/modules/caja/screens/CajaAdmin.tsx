import { useEffect, useMemo, useState } from "react";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { Paginacion } from "../../../components/Paginacion";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { useOperaciones } from "../../../context/OperacionesContext";
import { formatoMoneda } from "../../../utils/formato";
import { TarjetaMetrica } from "../../administracion/components/TarjetaMetrica";

type PeriodoCaja = "hoy" | "ayer" | "semana" | "mes" | "año" | "todo";

function esHoy(fechaIso: string, hoy: Date): boolean {
  const d = new Date(fechaIso);
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
}

function dentroDePeriodo(fechaIso: string, periodo: PeriodoCaja, hoy: Date): boolean {
  if (periodo === "todo") return true;
  if (periodo === "hoy") return esHoy(fechaIso, hoy);
  const fecha = new Date(fechaIso);
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
  if (periodo === "año") {
    const hace365 = new Date(copiaHoy);
    hace365.setDate(hace365.getDate() - 365);
    return fecha >= hace365;
  }
  return true;
}

type FiltroMedio = "ingresos" | "egresos" | "efectivo" | "nequi" | "credito" | null;
type VistaCaja = "movimientos" | "ganancias";

const ETIQUETA_PERIODO: Record<PeriodoCaja, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Semanal",
  mes: "Mensual",
  "año": "Año",
  todo: "Todo",
};

const PERIODOS: PeriodoCaja[] = ["hoy", "ayer", "semana", "mes", "año", "todo"];

export function CajaAdmin() {
  const { movimientosCaja, pedidos, abonos, obtenerCliente, nombreUsuario } = useOperaciones();
  const [periodo, setPeriodo] = useState<PeriodoCaja>("hoy");
  const [vistaCaja, setVistaCaja] = useState<VistaCaja>("movimientos");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [filtroMedio, setFiltroMedio] = useState<FiltroMedio>(null);
  const hoy = useMemo(() => new Date(), []);

  useEffect(() => { setPagina(1); }, [periodo, busqueda, filtroMedio]);

  // Base del periodo (las tarjetas no cambian al filtrar por medio)
  const movimientosPeriodo = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return movimientosCaja
      .filter((m) => {
        if (!dentroDePeriodo(m.creadoEn, periodo, hoy)) return false;
        if (!q) return true;
        const pedido = pedidos.find((p) => p.id === m.referenciaId);
        const clientePedido = pedido ? obtenerCliente(pedido.clienteId) : null;
        const abono = abonos.find((a) => a.id === m.referenciaId);
        const clienteAbono = abono ? obtenerCliente(abono.clienteId) : null;
        const cliente = clientePedido ?? clienteAbono;
        return (
          m.concepto.toLowerCase().includes(q) ||
          (m.metodo ?? "").toLowerCase().includes(q) ||
          m.tipo.includes(q) ||
          (pedido?.numero.toLowerCase().includes(q) ?? false) ||
          (cliente?.nombre.toLowerCase().includes(q) ?? false) ||
          (cliente?.alias.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0));
  }, [abonos, busqueda, hoy, movimientosCaja, obtenerCliente, pedidos, periodo]);

  const ingresos = movimientosPeriodo.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const egresos = movimientosPeriodo.filter((m) => m.tipo === "egreso").reduce((s, m) => s + m.monto, 0);
  const efectivo = movimientosPeriodo.filter((m) => m.tipo === "ingreso" && m.metodo === "efectivo").reduce((s, m) => s + m.monto, 0);
  const nequi = movimientosPeriodo.filter((m) => m.tipo === "ingreso" && m.metodo === "nequi").reduce((s, m) => s + m.monto, 0);
  const pedidosCreditoPeriodo = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (p.estado === "cancelado" || p.pago.saldoPendiente <= 0) return false;
      if (!dentroDePeriodo(p.creadoEn, periodo, hoy)) return false;
      if (!q) return true;
      const cliente = obtenerCliente(p.clienteId);
      return (
        p.numero.toLowerCase().includes(q) ||
        cliente?.nombre.toLowerCase().includes(q) ||
        cliente?.alias.toLowerCase().includes(q)
      );
    });
  }, [busqueda, hoy, obtenerCliente, pedidos, periodo]);
  const creditoPendiente = pedidosCreditoPeriodo.reduce((s, p) => s + p.pago.saldoPendiente, 0);

  const movimientosVista = useMemo(() => {
    if (filtroMedio === "ingresos") return movimientosPeriodo.filter((m) => m.tipo === "ingreso");
    if (filtroMedio === "egresos") return movimientosPeriodo.filter((m) => m.tipo === "egreso");
    if (filtroMedio === "efectivo") return movimientosPeriodo.filter((m) => m.tipo === "ingreso" && m.metodo === "efectivo");
    if (filtroMedio === "nequi") return movimientosPeriodo.filter((m) => m.tipo === "ingreso" && m.metodo === "nequi");
    return movimientosPeriodo;
  }, [filtroMedio, movimientosPeriodo]);

  const balance = ingresos - egresos;
  const esVistaCredito = filtroMedio === "credito";

  // Ganancias por periodo: lo cobrado menos compras y gastos, sin el filtro de búsqueda.
  const resumenPorPeriodo = useMemo(() => {
    return PERIODOS.map((p) => {
      const movs = movimientosCaja.filter((m) => dentroDePeriodo(m.creadoEn, p, hoy));
      const entra = movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
      const sale = movs.filter((m) => m.tipo === "egreso").reduce((s, m) => s + m.monto, 0);
      return { periodo: p, ingresos: entra, egresos: sale, neto: entra - sale };
    });
  }, [hoy, movimientosCaja]);
  const gananciaPeriodo = resumenPorPeriodo.find((fila) => fila.periodo === periodo) ?? { periodo, ingresos: 0, egresos: 0, neto: 0 };
  const totalVista = esVistaCredito ? pedidosCreditoPeriodo.length : movimientosVista.length;
  const { items: paginaMovs, totalPaginas: paginasMovs } = useMemo(() => paginar(movimientosVista, pagina, POR_PAGINA), [movimientosVista, pagina]);
  const { items: paginaCred, totalPaginas: paginasCred } = useMemo(() => paginar(pedidosCreditoPeriodo, pagina, POR_PAGINA), [pedidosCreditoPeriodo, pagina]);
  const totalPaginas = esVistaCredito ? paginasCred : paginasMovs;

  function alternarFiltro(medio: Exclude<FiltroMedio, null>) {
    setFiltroMedio((actual) => (actual === medio ? null : medio));
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Cuadre de caja</h2>
          <GuiaAyuda
            pantalla="Cuadre de caja"
            pasos={[
              { titulo: "1 · Tarjetas que filtran", texto: "Toca Ingresos, Egresos, Efectivo, Nequi o Crédito para filtrar el historial; tócalas de nuevo para quitar el filtro. El Balance solo muestra el resultado del periodo." },
              { titulo: "2 · Ganancias por periodo", texto: "La pestaña Ganancias muestra cuánto quedó después de compras y gastos, con el historial de hoy, ayer, semanal, mensual, año y todo." },
              { titulo: "3 · Filtros hoy → todo", texto: "Hoy solo hoy, ayer solo ayer, semana/mes/año los últimos días. Todo al final muestra todo sin duplicar registros." },
              { titulo: "4 · Buscador y colores", texto: "Busca por concepto, pedido o cliente. Verde = ingreso en efectivo, teal = Nequi, rojo = egreso o crédito." },
              { titulo: "5 · Dónde registrar", texto: "Los egresos se crean en Compras (gastos o recepciones). Los abonos de crédito crean aquí el ingreso." },
            ]}
          />
        </div>
      </div>

      <div className="flex-shrink-0 space-y-2 pt-2">
        <div className="inline-flex w-full rounded-full border border-line bg-paper-raised p-1">
          {(["movimientos", "ganancias"] as VistaCaja[]).map((vista) => (
            <button
              key={vista}
              type="button"
              onClick={() => setVistaCaja(vista)}
              className={`flex-1 rounded-full px-3 py-1 text-[12px] font-semibold capitalize transition-colors ${
                vistaCaja === vista ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {vista === "movimientos" ? "Movimientos" : "Ganancias"}
            </button>
          ))}
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold capitalize transition-colors ${
                periodo === p ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {vistaCaja === "movimientos" && (
          <>
        {/* Tarjetas compactas: Ingresos, Egresos y Balance también filtran el historial */}
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => alternarFiltro("ingresos")} aria-pressed={filtroMedio === "ingresos"} className={`rounded-xl text-left transition-all ${filtroMedio === "ingresos" ? "ring-2 ring-teal" : ""}`}>
            <TarjetaMetrica tamano="sm" etiqueta="Ingresos" valor={formatoMoneda(ingresos)} tono="teal" />
          </button>
          <button type="button" onClick={() => alternarFiltro("egresos")} aria-pressed={filtroMedio === "egresos"} className={`rounded-xl text-left transition-all ${filtroMedio === "egresos" ? "ring-2 ring-danger" : ""}`}>
            <TarjetaMetrica tamano="sm" etiqueta="Egresos" valor={formatoMoneda(egresos)} tono="danger" />
          </button>
          <TarjetaMetrica
            tamano="sm"
            etiqueta="Balance"
            valor={formatoMoneda(balance)}
            tono={balance > 0 ? "success" : balance < 0 ? "danger" : "ink"}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => alternarFiltro("efectivo")} aria-pressed={filtroMedio === "efectivo"} className={`rounded-xl text-left transition-all ${filtroMedio === "efectivo" ? "ring-2 ring-success" : ""}`}>
            <TarjetaMetrica tamano="sm" etiqueta="Efectivo" valor={formatoMoneda(efectivo)} tono="success" />
          </button>
          <button type="button" onClick={() => alternarFiltro("nequi")} aria-pressed={filtroMedio === "nequi"} className={`rounded-xl text-left transition-all ${filtroMedio === "nequi" ? "ring-2 ring-teal" : ""}`}>
            <TarjetaMetrica tamano="sm" etiqueta="Nequi" valor={formatoMoneda(nequi)} tono="teal" />
          </button>
          <button type="button" onClick={() => alternarFiltro("credito")} aria-pressed={filtroMedio === "credito"} className={`rounded-xl text-left transition-all ${filtroMedio === "credito" ? "ring-2 ring-danger" : ""}`}>
            <TarjetaMetrica tamano="sm" etiqueta="Crédito" valor={formatoMoneda(creditoPendiente)} tono="accent" />
          </button>
        </div>

        <p className="text-[10.5px] text-ink-faint">
          {filtroMedio === "credito"
            ? "Crédito pendiente del periodo (aún no es caja, se cobra en Créditos)"
            : filtroMedio
              ? `Filtrando: ${filtroMedio} · toca de nuevo la tarjeta para quitarlo`
              : "Toca una tarjeta para filtrar el historial"}
        </p>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por concepto, pedido o cliente"
          className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
          </>
        )}
      </div>

      {vistaCaja === "ganancias" && (
        <div className="flex min-h-0 flex-1 flex-col py-2.5">
          <div className="flex-shrink-0 rounded-2xl border border-line bg-paper-raised p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Ganancia neta · {ETIQUETA_PERIODO[periodo]}
            </p>
            <p className={`mt-1 font-mono text-[30px] font-bold ${gananciaPeriodo.neto > 0 ? "text-success" : gananciaPeriodo.neto < 0 ? "text-danger" : "text-ink"}`}>
              {formatoMoneda(gananciaPeriodo.neto)}
            </p>
            <p className="text-[11.5px] text-ink-soft">Ventas y abonos cobrados menos compras y gastos del periodo.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-teal-soft px-3 py-2">
                <p className="font-mono text-[14px] font-semibold text-teal">{formatoMoneda(gananciaPeriodo.ingresos)}</p>
                <p className="mt-0.5 text-[10.5px] text-teal">Entró · ventas y abonos</p>
              </div>
              <div className="rounded-xl border border-line bg-danger-soft px-3 py-2">
                <p className="font-mono text-[14px] font-semibold text-danger">{formatoMoneda(gananciaPeriodo.egresos)}</p>
                <p className="mt-0.5 text-[10.5px] text-danger">Salió · compras y gastos</p>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Historial de ganancias</p>
              <span className="text-[11px] text-ink-soft">Toca un periodo</span>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              <ul className="space-y-2">
                {resumenPorPeriodo.map((fila) => (
                  <li key={fila.periodo}>
                    <button
                      type="button"
                      onClick={() => setPeriodo(fila.periodo)}
                      aria-pressed={periodo === fila.periodo}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        periodo === fila.periodo ? "border-ink bg-paper-raised ring-1 ring-ink/20" : "border-line bg-paper-raised active:bg-paper-sunken"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink">{ETIQUETA_PERIODO[fila.periodo]}</span>
                        <span className="block truncate text-[11px] text-ink-soft">
                          Entró {formatoMoneda(fila.ingresos)} · Salió {formatoMoneda(fila.egresos)}
                        </span>
                      </span>
                      <span className={`flex-shrink-0 font-mono text-[14px] font-bold ${fila.neto > 0 ? "text-success" : fila.neto < 0 ? "text-danger" : "text-ink-soft"}`}>
                        {formatoMoneda(fila.neto)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Lista con scroll propio */}
      {vistaCaja === "movimientos" && (
        <>
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {esVistaCredito ? `Créditos (${pedidosCreditoPeriodo.length})` : `Movimientos (${movimientosVista.length})`}
            </p>
            <span className="text-[11px] text-ink-soft">Recientes primero</span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-2">
        {esVistaCredito ? (
          paginaCred.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-8 text-center text-[13px] text-ink-soft">
              Sin créditos pendientes para este filtro.
            </div>
          ) : (
            paginaCred.map((pedido) => {
              const cliente = obtenerCliente(pedido.clienteId);
              return (
                <article key={pedido.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised p-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{pedido.numero} · {cliente?.nombre ?? "Cliente"}</p>
                    <p className="truncate text-[11.5px] text-ink-soft">
                      {new Date(pedido.creadoEn).toLocaleDateString("es-CO")} · <span className="capitalize">{pedido.estado.replace("-", " ")}</span>
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-semibold text-danger">
                      Crédito pendiente
                    </span>
                  </div>
                  <p className="flex-shrink-0 font-mono text-[13.5px] font-bold text-danger">
                    {formatoMoneda(pedido.pago.saldoPendiente)}
                  </p>
                </article>
              );
            })
          )
        ) : paginaMovs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-8 text-center text-[13px] text-ink-soft">
            Sin movimientos para este filtro.
          </div>
        ) : (
          paginaMovs.map((movimiento) => {
            const pedido = pedidos.find((p) => p.id === movimiento.referenciaId);
            const abono = abonos.find((a) => a.id === movimiento.referenciaId);
            const cliente = pedido ? obtenerCliente(pedido.clienteId) : abono ? obtenerCliente(abono.clienteId) : null;
            const esEfectivo = movimiento.tipo === "ingreso" && movimiento.metodo === "efectivo";
            const esNequi = movimiento.tipo === "ingreso" && movimiento.metodo === "nequi";
            return (
              <article key={movimiento.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{movimiento.concepto}</p>
                  <p className="truncate text-[11.5px] capitalize text-ink-soft">
                    {movimiento.tipo} {movimiento.metodo ? `· ${movimiento.metodo}` : ""} · {new Date(movimiento.creadoEn).toLocaleDateString("es-CO")}
                    {cliente ? ` · ${cliente.nombre}` : ""}{pedido ? ` · ${pedido.numero}` : ""}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    movimiento.tipo === "egreso" ? "bg-danger-soft text-danger" : esNequi ? "bg-teal-soft text-teal" : esEfectivo ? "bg-success-soft text-success" : "bg-paper-sunken text-ink-soft"
                  }`}>
                    {movimiento.tipo === "egreso" ? "Egreso" : esNequi ? "Nequi" : esEfectivo ? "Efectivo" : movimiento.metodo ?? movimiento.tipo}
                  </span>
                  <p className="mt-0.5 text-[10.5px] text-ink-faint">Registró {nombreUsuario(movimiento.usuarioId)}</p>
                </div>
                <p className={`flex-shrink-0 font-mono text-[13.5px] font-bold ${
                  movimiento.tipo === "ingreso" ? (esNequi ? "text-teal" : "text-success") : "text-danger"
                }`}>
                  {movimiento.tipo === "ingreso" ? "+" : "−"}{formatoMoneda(movimiento.monto)}
                </p>
              </article>
            );
          })
        )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 mt-2">
        <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={totalVista} porPagina={POR_PAGINA} onChange={setPagina} />
      </div>
        </>
      )}
    </div>
  );
}
