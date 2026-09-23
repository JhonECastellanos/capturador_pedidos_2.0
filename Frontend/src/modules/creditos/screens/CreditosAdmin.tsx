import { useEffect, useMemo, useState } from "react";
import { Boton } from "../../../components/Boton";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { Paginacion, POR_PAGINA, paginar } from "../../../components/Paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/OperacionesContext";
import { diasEntre } from "../../../dominio/servicios";
import type { AbonoCredito } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

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

function telefonoParaWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.startsWith("57") ? digitos : `57${digitos}`;
}

export function CreditosAdmin() {
  const {
    clientes,
    pedidos,
    abonos,
    obtenerCliente,
    registrarAbono,
    actualizarFrecuenciaCredito,
    registrarRecordatorioCredito,
  } = useOperaciones();
  const [tab, setTab] = useState<TabCredito>("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [clienteDetalleId, setClienteDetalleId] = useState<string | null>(null);
  const [montoAbono, setMontoAbono] = useState("");
  const [metodoAbono, setMetodoAbono] = useState<AbonoCredito["metodo"]>("efectivo");
  const [comentarioAbono, setComentarioAbono] = useState("");
  const [frecuenciaTmp, setFrecuenciaTmp] = useState<Record<string, string>>({});
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
        const frecuencia = cliente?.frecuenciaCreditoDias ?? 2;
        const diasDesdeRecordatorio = cliente?.ultimoRecordatorioCreditoEn ? diasEntre(cliente.ultimoRecordatorioCreditoEn, hoy) : 999;
        const tocaRecordar = diasDesdeRecordatorio >= frecuencia;
        return { clienteId, cliente, pedidos: ordenados, total, masAntiguo, diasMora, frecuencia, diasDesdeRecordatorio, tocaRecordar };
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
        return cliente?.nombre.toLowerCase().includes(q) || cliente?.alias.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0));
  }, [abonos, busqueda, hoy, obtenerCliente, periodo]);

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

  function handleWhatsApp(grupo: (typeof grupos)[number]) {
    const cliente = grupo.cliente;
    if (!cliente?.telefono) return;
    const total = formatoMoneda(grupo.total);
    const mensaje = `Hola ${cliente.alias || cliente.nombre}, te recordamos tu saldo pendiente de ${total} por ${grupo.pedidos.length} pedido(s) (hace ${grupo.diasMora} día(s)). ¿Cuándo pasas a ponerte al día? ¡Gracias!`;
    const url = `https://wa.me/${telefonoParaWhatsApp(cliente.telefono)}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
    registrarRecordatorioCredito(grupo.clienteId);
  }

  if (clienteDetalle) {
    const c = clienteDetalle.cliente;
    return (
      <div className="flex h-full flex-col min-h-0">
        <div className="flex-shrink-0 flex items-center justify-between border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setClienteDetalleId(null); setMontoAbono(""); setComentarioAbono(""); }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper-raised text-ink active:bg-paper-sunken shadow-sm"
              aria-label="Volver a pendientes"
            >
              ←
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Gestión de crédito</p>
              <h2 className="font-display text-[17px] font-semibold text-ink">{c?.nombre ?? "Cliente"}</h2>
            </div>
          </div>
          <GuiaAyuda
            pantalla="Cobrar crédito"
            pasos={[
              { titulo: "1 · Pedidos del cliente", texto: "Ves cada pedido del cliente con fecha, número y saldo. El más antiguo se cobra primero." },
              { titulo: "2 · Registrar pago", texto: "Escribe lo que te pagó y elige efectivo o Nequi. Se reparte solo y crea el ingreso en caja." },
              { titulo: "3 · WhatsApp y frecuencia", texto: "Configura cada cuántos días recordar y envía el mensaje con un toque. Queda la fecha del recordatorio." },
            ]}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-3 space-y-3.5 max-w-xl">
          <p className="text-[12.5px] text-ink-soft">
            {c?.alias ? `“${c.alias}” · ` : ""}{c?.telefono ?? ""} · Hace {clienteDetalle.diasMora} día(s) · Total pendiente: <strong className="text-danger">{formatoMoneda(clienteDetalle.total)}</strong>
          </p>

          <div className="rounded-2xl border border-line bg-paper-raised p-3.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Pedidos pendientes ({clienteDetalle.pedidos.length})</p>
            <ul className="mt-2 divide-y divide-line/60">
              {clienteDetalle.pedidos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{p.numero} · {new Date(p.creadoEn).toLocaleDateString("es-CO")}</p>
                    <p className="text-[11.5px] text-ink-soft">Hace {diasEntre(p.creadoEn, hoy)} día(s) · <span className="capitalize">{p.estado.replace("-", " ")}</span></p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-[13px] font-semibold text-danger">{formatoMoneda(p.pago.saldoPendiente)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-line bg-paper-raised p-4">
            <p className="font-semibold text-ink">Registrar pago / abono</p>
            <div className="mt-3 inline-flex rounded-full border border-line bg-paper p-1">
              {(["efectivo", "nequi"] as AbonoCredito["metodo"][]).map((m) => (
                <button key={m} type="button" onClick={() => setMetodoAbono(m)} className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold capitalize ${metodoAbono === m ? "bg-ink text-white" : "text-ink-soft"}`}>
                  {m}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={montoAbono}
              onChange={(e) => setMontoAbono(e.target.value)}
              placeholder={`Monto (pendiente ${formatoMoneda(clienteDetalle.total)})`}
              className="mt-3 w-full rounded-xl border border-line bg-paper px-3.5 py-3 font-mono text-[15px] font-semibold text-ink focus:border-ink focus:outline-none"
            />
            <input
              value={comentarioAbono}
              onChange={(e) => setComentarioAbono(e.target.value)}
              placeholder="Comentario (opcional)"
              className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
            <Boton onClick={() => setConfirmarAbono(true)} disabled={!Number(montoAbono)} className="mt-3">
              Revisar abono {montoAbono ? formatoMoneda(Number(montoAbono)) : ""} por {metodoAbono}
            </Boton>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">Se aplica al pedido más antiguo primero y descuenta del saldo del cliente. Crea ingreso en caja.</p>
          </div>

          <div className="rounded-2xl border border-line bg-paper-raised p-4">
            <p className="font-semibold text-ink">Recordatorio WhatsApp</p>
            <p className="mt-1 text-[12px] text-ink-soft">
              Cada {clienteDetalle.frecuencia} día(s) ·{" "}
              {clienteDetalle.diasDesdeRecordatorio >= 900 ? "nunca enviado" : `último hace ${clienteDetalle.diasDesdeRecordatorio} día(s)`} ·{" "}
              {clienteDetalle.tocaRecordar ? "Toca recordar hoy" : "Al día"}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                min={1}
                max={90}
                value={frecuenciaTmp[c?.id ?? ""] ?? String(clienteDetalle.frecuencia)}
                onChange={(e) => setFrecuenciaTmp((f) => ({ ...f, [c?.id ?? ""]: e.target.value }))}
                className="w-20 rounded-lg border border-line bg-paper px-3 py-2 text-center text-[13px] text-ink focus:border-ink focus:outline-none"
              />
              <button
                type="button"
                onClick={() => c && actualizarFrecuenciaCredito(c.id, Number(frecuenciaTmp[c.id] ?? clienteDetalle.frecuencia))}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-[12px] font-semibold text-ink active:bg-paper-sunken"
              >
                Guardar días
              </button>
              <button
                type="button"
                onClick={() => handleWhatsApp(clienteDetalle)}
                disabled={!c?.telefono}
                className="flex-1 rounded-lg bg-success py-2 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                WhatsApp 💬
              </button>
            </div>
            {!c?.telefono && <p className="mt-2 text-[11.5px] text-danger">Sin teléfono para WhatsApp.</p>}
          </div>
        </div>

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
              { titulo: "2 · Cobrar", texto: "Toca un cliente para ver sus pedidos y registrar lo que te pagó por efectivo o Nequi. Se reparte al más antiguo." },
              { titulo: "3 · Contador y WhatsApp", texto: "Cada cliente tiene días de mora y frecuencia personalizable. Envía el recordatorio a WhatsApp con un toque." },
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

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={tab === "pendientes" ? "Buscar por cliente, teléfono o consecutivo" : "Buscar abono por cliente"}
          className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>

      {/* Lista con scroll propio */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {tab === "pendientes" ? `Pendientes (${gruposFiltrados.length})` : `Abonos (${abonosFiltrados.length})`}
            </p>
            <span className="text-[11px] text-ink-soft">
              {tab === "pendientes" ? "Toca para cobrar" : "Reparto al más antiguo"}
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
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${g.tocaRecordar ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
                    {g.tocaRecordar ? "Toca recordar" : `Recordar cada ${g.frecuencia}d`}
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
            return (
              <article key={a.id} className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">{cliente?.nombre ?? "Cliente"}</p>
                    <p className="text-[12px] text-ink-soft">{new Date(a.creadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} · {a.metodo} · por {a.usuarioId.slice(0, 8)}</p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-[13px] font-semibold text-success">+{formatoMoneda(a.monto)}</span>
                </div>
                <ul className="mt-2 divide-y divide-line/60 rounded-lg border border-line bg-paper p-1.5">
                  {a.pedidosAfectados.map((p) => (
                    <li key={p.pedidoId} className="flex justify-between px-2 py-1 text-[12px]">
                      <span className="text-ink">{p.numero}</span>
                      <span className="font-mono text-ink-soft">{formatoMoneda(p.montoAplicado)}</span>
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
