import { useEffect, useMemo, useState } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { Boton } from "../../../components/Boton";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { IconArrowLeft } from "../../../components/Icons";
import { Paginacion } from "../../../components/Paginacion";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/OperacionesContext";
import { diasEntre } from "../../../dominio/servicios";
import type { AbonoCredito } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";
import { PedidoDetalle } from "../../ventas/screens/PedidoDetalle";

type TabCredito = "pendientes" | "historial";
type Periodo = "hoy" | "ayer" | "semana" | "mes" | "todo";

function esHoy(fechaIso: string, hoy: Date): boolean {
  const d = new Date(fechaIso);
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
}

function dentroDePeriodo(fechaIso: string, periodo: Periodo, hoy: Date): boolean {
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
  return true;
}

export function CreditosAdmin() {
  const {
    clientes,
    pedidos,
    abonos,
    obtenerCliente,
    registrarAbono,
  } = useOperaciones();
  const [tab, setTab] = useState<TabCredito>("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [clienteDetalleId, setClienteDetalleId] = useState<string | null>(null);
  const [pedidoDetalleId, setPedidoDetalleId] = useState<string | null>(null);
  const [montoAbono, setMontoAbono] = useState("");
  const [metodoAbono, setMetodoAbono] = useState<AbonoCredito["metodo"]>("efectivo");
  const [comentarioAbono, setComentarioAbono] = useState("");
  const [pagina, setPagina] = useState(1);
  const [confirmarAbono, setConfirmarAbono] = useState(false);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();
  const hoy = useMemo(() => new Date(), []);

  useEffect(() => { setPagina(1); }, [tab, busqueda, periodo]);

  const grupos = useMemo(() => {
    const pendientes = pedidos.filter((p) => p.pago.saldoPendiente > 0 && p.estado !== "cancelado");
    const porCliente = new Map<string, typeof pendientes>();
    pendientes.forEach((p) => {
      const lista = porCliente.get(p.clienteId) ?? [];
      lista.push(p);
      porCliente.set(p.clienteId, lista);
    });
    return [...porCliente.entries()]
      .map(([clienteId, lista]) => {
        const cliente = obtenerCliente(clienteId) ?? clientes.find((c) => c.id === clienteId) ?? null;
        const ordenados = [...lista].sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime());
        const total = ordenados.reduce((s, p) => s + p.pago.saldoPendiente, 0);
        const masAntiguo = ordenados[0]?.creadoEn ?? new Date().toISOString();
        const diasMora = diasEntre(masAntiguo, hoy);
        return { clienteId, cliente, pedidos: ordenados, total, masAntiguo, diasMora };
      })
      .sort((a, b) => b.total - a.total);
  }, [clientes, hoy, obtenerCliente, pedidos]);

  const gruposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter((g) => {
      const c = g.cliente;
      return (
        c?.nombre.toLowerCase().includes(q) ||
        c?.alias.toLowerCase().includes(q) ||
        c?.telefono.includes(q) ||
        g.pedidos.some((p) => p.numero.toLowerCase().includes(q))
      );
    });
  }, [busqueda, grupos]);

  const abonosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return abonos
      .filter((a) => {
        if (!dentroDePeriodo(a.creadoEn, periodo, hoy)) return false;
        if (!q) return true;
        const cliente = obtenerCliente(a.clienteId);
        return (
          cliente?.nombre.toLowerCase().includes(q) ||
          cliente?.alias.toLowerCase().includes(q) ||
          a.pedidosAfectados.some((p) => p.numero.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0));
  }, [abonos, busqueda, hoy, obtenerCliente, periodo]);

  /** Total efectivamente abonado a facturas a crédito en el periodo filtrado. */
  const totalAbonadoPeriodo = useMemo(
    () => abonosFiltrados.reduce((suma, a) => suma + a.monto, 0),
    [abonosFiltrados],
  );

  const totalPendiente = grupos.reduce((s, g) => s + g.total, 0);
  const clienteDetalle = grupos.find((g) => g.clienteId === clienteDetalleId) ?? null;

  function handleRegistrarAbono() {
    if (!clienteDetalle) return;
    const monto = Number(montoAbono);
    if (!monto || monto <= 0) return;
    const res = registrarAbono(clienteDetalle.clienteId, monto, metodoAbono, comentarioAbono || undefined);
    if (res) {
      mostrarAviso(`Abono ${formatoMoneda(monto)} por ${metodoAbono} registrado`, "exito");
      setMontoAbono("");
      setComentarioAbono("");
    }
  }

  // Paso: detalle del pedido en crédito (se abre al tocar un pedido que debe).
  if (pedidoDetalleId) {
    const pedido = pedidos.find((p) => p.id === pedidoDetalleId);
    if (pedido) {
      return (
        <PedidoDetalle
          pedido={pedido}
          onVolver={() => setPedidoDetalleId(null)}
          varianteHeader="compacto"
          permitirCobro
        />
      );
    }
  }

  if (clienteDetalle) {
    const c = clienteDetalle.cliente;
    const valor = Number(montoAbono) || 0;
    const saldoTrasAbono = Math.max(0, clienteDetalle.total - valor);
    return (
      <div className="flex h-full flex-col min-h-0">
        {/* Cabecera compacta con volver (fija) */}
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b border-line pb-2.5">
          <button
            type="button"
            onClick={() => { setClienteDetalleId(null); setMontoAbono(""); setComentarioAbono(""); }}
            aria-label="Volver a pendientes"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-line bg-paper-raised text-ink active:bg-paper-sunken"
          >
            <IconArrowLeft width={16} height={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Gestión de crédito</p>
            <h2 className="truncate font-display text-[15px] font-semibold text-ink">{c?.nombre ?? "Cliente"}</h2>
          </div>
          <GuiaAyuda
            pantalla="Cobrar crédito"
            pasos={[
              { titulo: "1 · Saldo pendiente", texto: "Arriba, en rojo, ves cuánto debe el cliente y hace cuántos días." },
              { titulo: "2 · Registrar pago", texto: "Escribe lo que te pagó y elige efectivo o Nequi. Se reparte al pedido más antiguo y crea el ingreso en caja." },
              { titulo: "3 · Pedidos que debe", texto: "Toca cualquier pedido para ver su detalle completo y, si quieres, cobrarlo ahí mismo." },
            ]}
          />
        </div>

        {/* Scroll general: saldo, pago y pedidos (el pie queda fijo) */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-3 md:px-6">
          <div className="space-y-2.5">
            {/* 1 · Saldo pendiente en rojo */}
            <div className="rounded-2xl border border-danger/20 bg-danger-soft px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-danger/80">Saldo pendiente</p>
              <p className="font-mono text-[21px] font-bold leading-tight text-danger">{formatoMoneda(clienteDetalle.total)}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-soft">
                {clienteDetalle.pedidos.length} pedido(s) · hace {clienteDetalle.diasMora} día(s) · {c?.telefono || "sin teléfono"}
              </p>
            </div>

            {/* 2 · Registrar pago / abono */}
            <div className="rounded-2xl border border-line bg-paper-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Registrar pago / abono</p>
                <div className="inline-flex rounded-full border border-line bg-paper p-0.5">
                  {(["efectivo", "nequi"] as AbonoCredito["metodo"][]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoAbono(m)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize transition-colors ${metodoAbono === m ? "bg-ink text-white" : "text-ink-soft"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={montoAbono}
                onChange={(e) => setMontoAbono(e.target.value)}
                placeholder={`Monto (debe ${formatoMoneda(clienteDetalle.total)})`}
                className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2 font-mono text-[14px] font-semibold text-ink focus:border-ink focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setMontoAbono(String(clienteDetalle.total))} className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink active:bg-paper-sunken">
                  Liquidar todo
                </button>
                <button type="button" onClick={() => setMontoAbono(String(Math.round(clienteDetalle.total / 2)))} className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink active:bg-paper-sunken">
                  Mitad
                </button>
                {valor > 0 && (
                  <span className={`text-[10.5px] font-semibold ${saldoTrasAbono === 0 ? "text-success" : "text-ink-soft"}`}>
                    {saldoTrasAbono === 0 ? "✓ Liquida el crédito completo" : `Quedará debiendo ${formatoMoneda(saldoTrasAbono)}`}
                  </span>
                )}
              </div>
              <input
                value={comentarioAbono}
                onChange={(e) => setComentarioAbono(e.target.value)}
                placeholder="Comentario (opcional)"
                className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              />
            </div>

            {/* 3 · Pedidos que debe (lista completa dentro del scroll general) */}
            <div className="rounded-2xl border border-line bg-paper-sunken/30 p-2">
              <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Pedidos que debe ({clienteDetalle.pedidos.length})
              </p>
              <ul className="space-y-1.5">
                {clienteDetalle.pedidos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPedidoDetalleId(p.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-paper-raised px-3 py-2 text-left active:bg-paper-sunken"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[12px] font-semibold text-ink">{p.numero}</span>
                        <span className="block truncate text-[10.5px] text-ink-soft">
                          {new Date(p.creadoEn).toLocaleDateString("es-CO")} · hace {diasEntre(p.creadoEn, hoy)} día(s) ·{" "}
                          <span className="capitalize">{p.estado.replace("-", " ")}</span>
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className="block font-mono text-[12.5px] font-bold text-danger">{formatoMoneda(p.pago.saldoPendiente)}</span>
                        <span className="text-[10px] font-semibold text-teal">Ver detalle →</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <BarraInferior>
          <Boton onClick={() => setConfirmarAbono(true)} disabled={valor <= 0}>
            Registrar {valor > 0 ? formatoMoneda(valor) : "abono"} por {metodoAbono}
          </Boton>
        </BarraInferior>

        <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

        <ConfirmarAccion
          abierto={confirmarAbono}
          titulo="Confirmar abono"
          mensaje={`${c?.nombre ?? "Cliente"}: ${montoAbono ? formatoMoneda(Number(montoAbono)) : ""} por ${metodoAbono}. Se aplica al pedido más antiguo y crea el ingreso en caja.`}
          textoConfirmar="Registrar abono"
          tono="exito"
          alCancelar={() => setConfirmarAbono(false)}
          alConfirmar={() => {
            setConfirmarAbono(false);
            handleRegistrarAbono();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-start justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Créditos</h2>
          <GuiaAyuda
            pantalla="Créditos"
            pasos={[
              { titulo: "1 · Pendientes", texto: "Lista lo no pagado por cliente con fecha, pedidos y total. Busca por nombre, alias, teléfono o consecutivo." },
              { titulo: "2 · Cobrar", texto: "Toca un cliente: verás el saldo en rojo, el formulario de pago y los pedidos que debe. Se reparte al más antiguo." },
              { titulo: "3 · Detalle del pedido", texto: "Toca cualquier pedido en crédito para abrir su detalle completo y cobrarlo ahí mismo si lo necesitas." },
              { titulo: "4 · Historial", texto: "Pestaña Historial con todos los abonos, periodo y buscador, igual que los demás módulos." },
            ]}
          />
        </div>
        <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger">{formatoMoneda(totalPendiente)} por cobrar</span>
      </div>

      <div className="flex-shrink-0 space-y-2 pt-2.5">
        <div className="inline-flex rounded-full border border-line bg-paper-raised p-1">
          <button type="button" onClick={() => setTab("pendientes")} className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${tab === "pendientes" ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>
            Pendientes ({grupos.length})
          </button>
          <button type="button" onClick={() => setTab("historial")} className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${tab === "historial" ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>
            Historial ({abonos.length})
          </button>
        </div>

        {tab === "historial" && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
            {(["hoy", "ayer", "semana", "mes", "todo"] as Periodo[]).map((p) => (
              <button key={p} type="button" onClick={() => setPeriodo(p)} className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium capitalize transition-colors ${periodo === p ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}>
                {p}
              </button>
            ))}
          </div>
        )}

        {tab === "historial" && (
          <div className="flex items-center justify-between rounded-xl border border-success/25 bg-success-soft px-3 py-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-success">
              Abonado a facturas en el periodo
            </span>
            <span className="font-mono text-[14px] font-bold text-success">{formatoMoneda(totalAbonadoPeriodo)}</span>
          </div>
        )}

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={tab === "pendientes" ? "Buscar por cliente, teléfono o consecutivo" : "Buscar por cliente o nº de factura"}
          className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>

      {/* Lista con scroll propio */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {tab === "pendientes" ? `Pendientes (${gruposFiltrados.length})` : `Abonos a crédito (${abonosFiltrados.length})`}
            </p>
            <span className="text-[11px] text-ink-soft">
              {tab === "pendientes" ? "Toca para cobrar" : "Cada abono muestra sus facturas"}
            </span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-2.5">
        {tab === "pendientes" ? (
          gruposFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-10 text-center">
              <p className="text-[13px] font-medium text-ink">Sin créditos pendientes. Todo al día ✓</p>
            </div>
          ) : (
            paginar(gruposFiltrados, pagina, POR_PAGINA).items.map((g) => (
              <article key={g.clienteId} role="button" tabIndex={0} onClick={() => setClienteDetalleId(g.clienteId)} onKeyDown={(e) => e.key === "Enter" && setClienteDetalleId(g.clienteId)} className="cursor-pointer rounded-xl border border-line bg-paper-raised p-3.5 text-left shadow-sm transition-shadow hover:shadow active:bg-paper-sunken">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">{g.cliente?.nombre ?? "Cliente"} {g.cliente?.alias ? `“${g.cliente.alias}”` : ""}</p>
                    <p className="text-[12px] text-ink-soft">{g.pedidos.length} pedido(s) · desde {new Date(g.masAntiguo).toLocaleDateString("es-CO")} · hace {g.diasMora} día(s)</p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-[13px] font-semibold text-danger">{formatoMoneda(g.total)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11.5px]">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${g.diasMora >= 8 ? "bg-danger-soft text-danger" : "bg-paper-sunken text-ink-soft"}`}>
                    {g.diasMora === 0 ? "Al día" : `${g.diasMora} día(s) de mora`}
                  </span>
                  <span className="text-teal font-semibold">Cobrar →</span>
                </div>
              </article>
            ))
          )
        ) : abonosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-ink">Sin abonos para este filtro.</p>
          </div>
        ) : (
          paginar(abonosFiltrados, pagina, POR_PAGINA).items.map((a) => {
            const cliente = obtenerCliente(a.clienteId);
            const facturas = a.pedidosAfectados.length;
            return (
              <article key={a.id} className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{cliente?.nombre ?? "Cliente"}</p>
                    <p className="truncate text-[11.5px] text-ink-soft">
                      {new Date(a.creadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} · {a.metodo} · por {a.usuarioId.slice(0, 8)}
                    </p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-[13.5px] font-bold text-success">+{formatoMoneda(a.monto)}</span>
                </div>

                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  Facturas a crédito abonadas ({facturas})
                </p>
                <ul className="mt-1 space-y-1">
                  {a.pedidosAfectados.map((p) => (
                    <li key={p.pedidoId}>
                      <button
                        type="button"
                        onClick={() => setPedidoDetalleId(p.pedidoId)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-left active:bg-paper-sunken"
                      >
                        <span className="truncate font-mono text-[12px] font-semibold text-ink">{p.numero}</span>
                        <span className="flex-shrink-0 text-right">
                          <span className="font-mono text-[12px] font-semibold text-success">{formatoMoneda(p.montoAplicado)}</span>
                          <span className="ml-1.5 text-[10px] font-semibold text-teal">Ver factura →</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {a.comentario && <p className="mt-2 text-[11.5px] italic text-ink-soft">“{a.comentario}”</p>}
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
        <Paginacion
          pagina={pagina}
          totalPaginas={Math.max(1, Math.ceil((tab === "pendientes" ? gruposFiltrados.length : abonosFiltrados.length) / POR_PAGINA))}
          total={tab === "pendientes" ? gruposFiltrados.length : abonosFiltrados.length}
          porPagina={POR_PAGINA}
          onChange={setPagina}
        />
      </div>
    </div>
  );
}
