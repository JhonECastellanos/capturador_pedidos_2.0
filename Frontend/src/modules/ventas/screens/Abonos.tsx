import { useMemo, useState } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { TarjetaClicable } from "../../../components/TarjetaClicable";
import { useTamanoPagina, paginar } from "../../../utils/paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/operaciones";
import { diasEntre, gruposCartera } from "../../../dominio/servicios";
import { usaApi } from "../../../data/api";
import { usePaginaApi } from "../../../data/usePaginaApi";
import type { GrupoCartera } from "../../../dominio/servicios";
import type { AbonoCredito, Pedido } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";
import { BadgeMora } from "../components/BadgeMora";
import { FormularioAbono } from "../components/FormularioAbono";

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
  const POR_PAGINA = useTamanoPagina();
  const { clientes, pedidos, registrarAbono } = useOperaciones();
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [busquedaPedidos, setBusquedaPedidos] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<AbonoCredito["metodo"]>("efectivo");
  const [comentario, setComentario] = useState("");
  const [pagina, setPagina] = useState(1);
  const [confirmarCobro, setConfirmarCobro] = useState(false);

  const hoy = useMemo(() => new Date(), []);

  const [paginaPedidos,setPaginaPedidos]=useState(1);
  const remotos=usePaginaApi<GrupoCartera & {cantidadPedidos:number}>(`/clientes/cartera/resumen?page=${pagina}&pageSize=${POR_PAGINA}&q=${encodeURIComponent(busqueda)}&orden=mora`);
  const clienteRemoto=usePaginaApi<GrupoCartera>(`/clientes/cartera/resumen?clienteId=${clienteId}&pageSize=5`,!!clienteId);
  const pendientesRemotos=usePaginaApi<Pedido>(`/pedidos?clienteId=${clienteId}&saldoPendiente=true&page=${paginaPedidos}&pageSize=${POR_PAGINA}&q=${encodeURIComponent(busquedaPedidos)}`,!!clienteId);
  const grupos = useMemo(() => usaApi ? remotos.items : gruposCartera(pedidos, clientes, hoy, "mora"), [clientes, hoy, pedidos,remotos.items]);

  const gruposFiltrados = useMemo(() => {
    if(usaApi) return grupos;
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

  const totalPendiente = usaApi ? Number(remotos.meta?.saldoTotal ?? 0) : grupos.reduce((suma, g) => suma + g.total, 0);
  const detalle = (usaApi ? clienteRemoto.items[0] : undefined) ?? grupos.find(g=>g.clienteId === clienteId) ?? null;
  const pedidosDetalle = usaApi ? pendientesRemotos.items : (detalle?.pedidos ?? []).filter((p) => p.numero.toLowerCase().includes(busquedaPedidos.trim().toLowerCase()));

  function abrirCliente(id: string) {
    const grupo = grupos.find((g) => g.clienteId === id);
    setClienteId(id);
    setPaginaPedidos(1);
    setBusquedaPedidos("");
    setMonto(grupo ? String(grupo.total) : "");
    setComentario("");
    setMetodo("efectivo");
  }

  function cerrarDetalle() {
    setClienteId(null);
    setMonto("");
    setComentario("");
  }

  async function confirmarAbono() {
    if (!detalle) return false;
    const valor = Number(monto);
    if (!valor || valor <= 0 || valor > detalle.total) return false;
    const resultado = await registrarAbono(detalle.clienteId, valor, metodo, comentario || undefined);
    setConfirmarCobro(false);
    if (!resultado) {
      mostrarAviso("No se pudo registrar el abono", "error");
      return false;
    }
    const saldoRestante = Math.max(0, detalle.total - resultado.monto);
    if (saldoRestante === 0) {
      mostrarAviso(`Crédito liquidado · ${formatoMoneda(resultado.monto)} recibidos`, "exito");
      cerrarDetalle();
    } else {
      mostrarAviso(`Abono ${formatoMoneda(resultado.monto)} · quedan ${formatoMoneda(saldoRestante)}`, "exito");
      setMonto(String(saldoRestante));
    }
    return true;
  }

  // ─── Detalle de cliente ───
  if (detalle) {
    const cliente = detalle.cliente;
    const valor = Number(monto) || 0;
    return (
      <div className="flex h-full flex-col min-h-0">
        <BarraSuperior
          titulo={cliente?.nombre ?? "Cliente"}
          subtitulo={`${cliente?.telefono || "sin teléfono"} · hace ${detalle.diasMora} día(s)`}
          onVolver={cerrarDetalle}
          derecha={
            <span className="flex flex-shrink-0 flex-col items-end gap-1">
              <span className="rounded-full bg-danger px-2.5 py-1 font-mono text-[12px] font-bold text-white">
                {formatoMoneda(detalle.total)}
              </span>
              <BadgeMora dias={detalle.diasMora} compacta />
            </span>
          }
        />

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-3 space-y-2.5 md:px-6">
          <div className="rounded-2xl border border-line bg-paper-raised p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Pedidos pendientes
            </p>
            <BuscadorInput value={busquedaPedidos} onChange={q=>{setBusquedaPedidos(q);setPaginaPedidos(1);}} placeholder="Buscar pedido pendiente por consecutivo" />
            <Paginacion pagina={paginaPedidos} totalPaginas={Math.max(1,Math.ceil((usaApi ? pendientesRemotos.total : pedidosDetalle.length)/POR_PAGINA))} total={usaApi ? pendientesRemotos.total : pedidosDetalle.length} porPagina={POR_PAGINA} onChange={setPaginaPedidos}/>
            {pedidosDetalle.length > POR_PAGINA && <p className="mt-1 text-[11px] text-ink-soft">Se muestran {POR_PAGINA} pedidos. Filtra por consecutivo para encontrar otro.</p>}
            <ul className="mt-1.5 divide-y divide-line/60">
              {(usaApi ? pedidosDetalle : paginar(pedidosDetalle,paginaPedidos,POR_PAGINA).items).map((p) => (
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
            <div className="mt-2">
              <FormularioAbono
                total={detalle.total}
                monto={monto}
                metodo={metodo}
                comentario={comentario}
                onMontoChange={setMonto}
                onMetodoChange={setMetodo}
                onComentarioChange={setComentario}
              />
            </div>
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
        <BuscadorInput
          value={busqueda}
          onChange={(valorBusqueda) => { setBusqueda(valorBusqueda); setPagina(1); }}
          placeholder="Buscar por cliente, teléfono o consecutivo"
        />
      </div>

      <Paginacion
          pagina={pagina}
          totalPaginas={Math.max(1, Math.ceil((usaApi ? remotos.total : gruposFiltrados.length) / POR_PAGINA))}
          total={usaApi ? remotos.total : gruposFiltrados.length}
          porPagina={POR_PAGINA}
          onChange={setPagina}
        />

      <div className="mx-5 mt-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2 rounded-2xl border border-line bg-paper-sunken/30 p-2 md:mx-6">
        {gruposFiltrados.length === 0 ? (
          <ListaVacia titulo="Sin créditos pendientes" texto="Todo al día ✓" />
        ) : (
          (usaApi ? gruposFiltrados : paginar(gruposFiltrados, pagina, POR_PAGINA).items).map((grupo) => (
            <TarjetaClicable key={grupo.clienteId} onClick={() => abrirCliente(grupo.clienteId)} className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger-soft font-display text-[12.5px] font-bold text-danger">
                {grupo.diasMora}d
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{grupo.cliente?.nombre ?? "Cliente"}</span>
                <span className="block truncate text-[11.5px] text-ink-soft">
                  {("cantidadPedidos" in grupo ? Number(grupo.cantidadPedidos) : grupo.pedidos.length)} pedido(s) · {grupo.cliente?.telefono || "sin teléfono"}
                </span>
              </span>
              <span className="flex-shrink-0 font-mono text-[13px] font-bold text-danger">{formatoMoneda(grupo.total)}</span>
            </TarjetaClicable>
          ))
        )}
      </div>



      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
    </div>
  );
}
