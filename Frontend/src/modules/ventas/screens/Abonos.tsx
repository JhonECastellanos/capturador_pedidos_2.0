import { useMemo, useState } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { IconSearch } from "../../../components/Icons";
import { Paginacion } from "../../../components/Paginacion";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/OperacionesContext";
import { diasEntre } from "../../../dominio/servicios";
import type { AbonoCredito } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

interface AbonosProps {
  onVolver: () => void;
  /** Texto del encabezado. */
  titulo?: string;
}

/**
 * Pantalla independiente de abonos: recibe dinero de créditos pendientes.
 * Al liquidar el total, el pedido y la cartera del cliente se actualizan solos.
 */
export function Abonos({ onVolver, titulo = "Recibir abonos" }: AbonosProps) {
  const { clientes, pedidos, registrarAbono } = useOperaciones();
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<AbonoCredito["metodo"]>("efectivo");
  const [comentario, setComentario] = useState("");
  const [pagina, setPagina] = useState(1);
  const [confirmarCobro, setConfirmarCobro] = useState(false);

  const hoy = useMemo(() => new Date(), []);

  const grupos = useMemo(() => {
    const pendientes = pedidos.filter((p) => p.pago.saldoPendiente > 0 && p.estado !== "cancelado");
    const porCliente = new Map<string, typeof pendientes>();
    pendientes.forEach((p) => {
      const lista = porCliente.get(p.clienteId) ?? [];
      lista.push(p);
      porCliente.set(p.clienteId, lista);
    });
    return [...porCliente.entries()]
      .map(([id, lista]) => {
        const cliente = clientes.find((c) => c.id === id) ?? null;
        const masAntiguo = lista.reduce((min, p) => (p.creadoEn < min ? p.creadoEn : min), lista[0].creadoEn);
        return {
          clienteId: id,
          cliente,
          pedidos: [...lista].sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : 1)),
          total: lista.reduce((suma, p) => suma + p.pago.saldoPendiente, 0),
          diasMora: diasEntre(masAntiguo, hoy),
        };
      })
      .sort((a, b) => b.diasMora - a.diasMora);
  }, [clientes, hoy, pedidos]);

  const gruposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter(
      (g) =>
        g.cliente?.nombre.toLowerCase().includes(q) ||
        g.cliente?.alias.toLowerCase().includes(q) ||
        g.cliente?.telefono.toLowerCase().includes(q) ||
        g.pedidos.some((p) => p.numero.toLowerCase().includes(q)),
    );
  }, [busqueda, grupos]);

  const totalPendiente = grupos.reduce((suma, g) => suma + g.total, 0);
  const detalle = grupos.find((g) => g.clienteId === clienteId) ?? null;

  function abrirCliente(id: string) {
    const grupo = grupos.find((g) => g.clienteId === id);
    setClienteId(id);
    setMonto(grupo ? String(grupo.total) : "");
    setComentario("");
    setMetodo("efectivo");
  }

  function cerrarDetalle() {
    setClienteId(null);
    setMonto("");
    setComentario("");
  }

  function confirmarAbono() {
    if (!detalle) return;
    const valor = Number(monto);
    if (!valor || valor <= 0) return;
    const resultado = registrarAbono(detalle.clienteId, valor, metodo, comentario || undefined);
    setConfirmarCobro(false);
    if (!resultado) {
      mostrarAviso("No se pudo registrar el abono", "error");
      return;
    }
    const saldoRestante = Math.max(0, detalle.total - resultado.monto);
    if (saldoRestante === 0) {
      mostrarAviso(`Crédito liquidado · ${formatoMoneda(resultado.monto)} recibidos`, "exito");
      cerrarDetalle();
    } else {
      mostrarAviso(`Abono ${formatoMoneda(resultado.monto)} · quedan ${formatoMoneda(saldoRestante)}`, "exito");
      setMonto(String(saldoRestante));
    }
  }

  // ─── Detalle de cliente ───
  if (detalle) {
    const cliente = detalle.cliente;
    const valor = Number(monto) || 0;
    const saldoTrasAbono = Math.max(0, detalle.total - valor);
    return (
      <div className="flex h-full flex-col min-h-0">
        <BarraSuperior
          titulo={cliente?.nombre ?? "Cliente"}
          subtitulo={`${cliente?.telefono || "sin teléfono"} · hace ${detalle.diasMora} día(s)`}
          onVolver={cerrarDetalle}
          derecha={
            <span className="flex-shrink-0 rounded-full bg-danger px-2.5 py-1 font-mono text-[12px] font-bold text-white">
              {formatoMoneda(detalle.total)}
            </span>
          }
        />

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-3 space-y-2.5 md:px-6">
          <div className="rounded-2xl border border-line bg-paper-raised p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Pedidos pendientes ({detalle.pedidos.length})
            </p>
            <ul className="mt-1.5 divide-y divide-line/60">
              {detalle.pedidos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {p.numero} · {new Date(p.creadoEn).toLocaleDateString("es-CO")}
                    </p>
                    <p className="text-[11px] text-ink-soft">Hace {diasEntre(p.creadoEn, hoy)} día(s)</p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-[12.5px] font-semibold text-danger">{formatoMoneda(p.pago.saldoPendiente)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-line bg-paper-raised p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Registrar abono</p>
            <div className="mt-2 inline-flex rounded-full border border-line bg-paper p-1">
              {(["efectivo", "nequi"] as AbonoCredito["metodo"][]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className={`rounded-full px-3.5 py-1 text-[12px] font-semibold capitalize transition-colors ${metodo === m ? "bg-ink text-white" : "text-ink-soft"}`}
                >
                  {m}
                </button>
              ))}
            </div>

            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={`Monto (debe ${formatoMoneda(detalle.total)})`}
              className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 font-mono text-[15px] font-semibold text-ink focus:border-ink focus:outline-none"
            />

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMonto(String(detalle.total))}
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink active:bg-paper-sunken"
              >
                Liquidar todo
              </button>
              <button
                type="button"
                onClick={() => setMonto(String(Math.round(detalle.total / 2)))}
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink active:bg-paper-sunken"
              >
                Mitad
              </button>
            </div>

            <input
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentario (opcional)"
              className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />

            {valor > 0 && (
              <p className={`mt-1.5 text-[11.5px] font-semibold ${saldoTrasAbono === 0 ? "text-success" : "text-ink-soft"}`}>
                {saldoTrasAbono === 0 ? "✓ Liquida el crédito completo (se marca como pagado)" : `Quedará debiendo ${formatoMoneda(saldoTrasAbono)}`}
              </p>
            )}
          </div>
        </div>

        <BarraInferior>
          <Boton disabled={valor <= 0} onClick={() => setConfirmarCobro(true)}>
            Recibir {valor > 0 ? formatoMoneda(valor) : "abono"} por {metodo}
          </Boton>
        </BarraInferior>

        <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

        <ConfirmarAccion
          abierto={confirmarCobro}
          titulo="Confirmar abono"
          mensaje={`Se recibirán ${formatoMoneda(valor)} por ${metodo} y se descontarán del pedido más antiguo. Queda registrado en caja.`}
          textoConfirmar="Sí, recibir"
          tono="exito"
          alCancelar={() => setConfirmarCobro(false)}
          alConfirmar={confirmarAbono}
        />
      </div>
    );
  }

  // ─── Lista de clientes con saldo ───
  return (
    <div className="flex h-full flex-col min-h-0">
      <BarraSuperior
        titulo={titulo}
        subtitulo="Créditos pendientes por cobrar"
        onVolver={onVolver}
        derecha={
          <span className="flex-shrink-0 rounded-full bg-danger px-2.5 py-1 font-mono text-[12px] font-bold text-white">
            {formatoMoneda(totalPendiente)}
          </span>
        }
      />

      <div className="flex-shrink-0 px-5 pt-3 md:px-6">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5">
          <IconSearch width={16} height={16} className="flex-shrink-0 text-ink-faint" />
          <input
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar por cliente, teléfono o consecutivo"
            className="w-full bg-transparent text-[13.5px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="mx-5 mt-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2 rounded-2xl border border-line bg-paper-sunken/30 p-2 md:mx-6">
        {gruposFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-ink">Sin créditos pendientes</p>
            <p className="mt-0.5 text-[11.5px] text-ink-soft">Todo al día ✓</p>
          </div>
        ) : (
          paginar(gruposFiltrados, pagina, POR_PAGINA).items.map((grupo) => (
            <button
              key={grupo.clienteId}
              type="button"
              onClick={() => abrirCliente(grupo.clienteId)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3 text-left shadow-sm active:bg-paper-sunken"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger-soft font-display text-[12.5px] font-bold text-danger">
                {grupo.diasMora}d
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{grupo.cliente?.nombre ?? "Cliente"}</span>
                <span className="block truncate text-[11.5px] text-ink-soft">
                  {grupo.pedidos.length} pedido(s) · {grupo.cliente?.telefono || "sin teléfono"}
                </span>
              </span>
              <span className="flex-shrink-0 font-mono text-[13px] font-bold text-danger">{formatoMoneda(grupo.total)}</span>
            </button>
          ))
        )}
      </div>

      <div className="flex-shrink-0 mt-2 px-5 md:px-6">
        <Paginacion
          pagina={pagina}
          totalPaginas={Math.max(1, Math.ceil(gruposFiltrados.length / POR_PAGINA))}
          total={gruposFiltrados.length}
          porPagina={POR_PAGINA}
          onChange={setPagina}
        />
      </div>

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
    </div>
  );
}
