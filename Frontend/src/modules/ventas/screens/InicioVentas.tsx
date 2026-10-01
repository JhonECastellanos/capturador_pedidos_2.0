import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { IconCash, IconChevronRight, IconClipboard, IconPackage, IconUser } from "../../../components/Icons";
import { ListaVacia } from "../../../components/ListaVacia";
import { useAuth } from "../../../context/auth";
import { fechaOperativa } from "../../../utils/fechas";
import { useOperaciones } from "../../../context/operaciones";
import { descuadreCajaDe } from "../../../dominio/servicios";
import { formatoMoneda } from "../../../utils/formato";
import { EtiquetaEstado } from "../../administracion/components/EtiquetaEstado";
import { EtiquetaPago } from "../../administracion/components/EtiquetaPago";
import { usaApi } from "../../../data/api";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { Paginacion } from "../../../components/Paginacion";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";

interface InicioVentasProps {
  /** Asistente para tomar un pedido. */
  rutaPedido: string;
  rutaCompletado: string;
  /** Pantalla de abonos del rol. */
  rutaAbonos: string;
  /** Alta rápida de cliente. */
  rutaNuevoCliente: string;
  /** Detalle donde se gestiona el pedido (estado y cobro). */
  rutaDetalle: (pedidoId: string) => string;
  /** Encabezado pequeño: distingue vendedor de administrador. */
  etiquetaRol: string;
  /** Texto de apoyo bajo el saludo. */
  descripcion: string;
}

function esMismoDia(fechaIso: string, referencia: Date): boolean {
  const fecha = new Date(fechaIso);
  return fecha.getFullYear() === referencia.getFullYear() && fecha.getMonth() === referencia.getMonth() && fecha.getDate() === referencia.getDate();
}

/**
 * Inicio del módulo de ventas, compartido por vendedor y administrador.
 * El administrador también vende: aquí tiene sus métricas, sus accesos
 * directos y la lista de pedidos del día para gestionarlos.
 */
export function InicioVentas({ rutaPedido, rutaCompletado, rutaAbonos, rutaNuevoCliente, rutaDetalle, etiquetaRol, descripcion }: InicioVentasProps) {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, cerrarSesion } = useAuth();
  const { pedidos, movimientosCaja, obtenerCliente, nombreUsuario } = useOperaciones();
  // `movimientosCaja` se usa indirectamente en el descuadre del dominio.

  const estadoInicial = ubicacion.state as { clienteCreado?: string; pedidoConfirmado?: string } | null;
  const [clienteCreado, setClienteCreado] = useState<string | null>(estadoInicial?.clienteCreado ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  const hoy = useMemo(() => new Date(), []);

  const pedidosHoy = useMemo(
    () =>
      pedidos
        .filter((p) => esMismoDia(fechaOperativa(p), hoy) && p.estado !== "cancelado")
        .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0)),
    [pedidos, hoy],
  );
  const ventasHoy = pedidosHoy.reduce((total, pedido) => total + pedido.total, 0);
  const pedidosFiltrados = pedidosHoy.filter((p) => !busqueda.trim() || `${p.numero} ${obtenerCliente(p.clienteId)?.nombre ?? "Venta ocasional"} ${nombreUsuario(p.vendedorId)}`.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const porCobrar = pedidos
    .filter((pedido) => pedido.estado !== "cancelado" && pedido.pago.saldoPendiente > 0)
    .reduce((suma, p) => suma + p.pago.saldoPendiente, 0);

  const descuadre = descuadreCajaDe(pedidos, movimientosCaja, hoy);

  // Con el día vacío evitamos tarjetas con $0: la app se ve "recién instalada".
  const tieneMetricasHoy = pedidosHoy.length > 0 || ventasHoy > 0 || porCobrar > 0 || descuadre !== 0;

  const acciones = [
    {
      titulo: "Crear Pedido",
      detalle: "Nuevo pedido",
      icono: <IconPackage width={19} height={19} />,
      tono: "bg-accent-soft text-accent-dark",
      onClick: () => navegar(rutaPedido),
    },
    {
      titulo: "Recibir Abono",
      detalle: "Cobrar créditos",
      icono: <IconCash width={19} height={19} />,
      tono: "bg-teal-soft text-teal",
      onClick: () => navegar(rutaAbonos),
    },
    {
      titulo: "Crear Cliente",
      detalle: "Alta en 5 datos",
      icono: <IconUser width={19} height={19} />,
      tono: "bg-paper-sunken text-ink",
      onClick: () => navegar(rutaNuevoCliente),
    },
  ];

  async function salir() {
    if (!await cerrarSesion()) return;
    navegar("/");
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <BarraSuperior
        variante="hero"
        etiqueta={etiquetaRol}
        titulo={`Hola, ${usuario?.nombre.split(" ")[0]}`}
        subtitulo={descripcion}
        derecha={
          <button type="button" onClick={salir} className="flex-shrink-0 rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/80">
            Salir
          </button>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col px-5 md:px-6">
        <section className="-mt-4 flex-shrink-0 rounded-2xl bg-paper-raised p-4 shadow-[0_12px_28px_-16px_rgba(48,77,37,0.35)]">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen de la jornada</p>
          {tieneMetricasHoy ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="font-mono text-[16px] font-semibold text-ink">{pedidosHoy.length}</p>
                <p className="text-[12px] text-ink-soft">Pedidos hoy</p>
              </div>
              <div>
                <p className="font-mono text-[16px] font-semibold text-ink">{formatoMoneda(ventasHoy)}</p>
                <p className="text-[12px] text-ink-soft">Ventas hoy</p>
              </div>
              <div>
                <p className="font-mono text-[16px] font-semibold text-danger">{formatoMoneda(porCobrar)}</p>
                <p className="text-[12px] text-ink-soft">Por cobrar</p>
              </div>
              <div>
                <p className={`font-mono text-[16px] font-semibold ${descuadre === 0 ? "text-success" : "text-danger"}`}>
                  {usaApi && usuario?.rol === "vendedor" ? "Solo administración" : descuadre === 0 ? "Cuadra ✓" : formatoMoneda(descuadre)}
                </p>
                <p className="text-[12px] text-ink-soft">Descuadre de caja</p>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-paper-sunken/50 p-3">
              <p className="text-[13px] font-medium text-ink">Aún no hay actividad hoy.</p>
              <p className="mt-1 text-[12px] text-ink-soft">Cuando registres pedidos o cobros, verás el resumen aquí.</p>
            </div>
          )}
        </section>

        {estadoInicial?.pedidoConfirmado && <button type="button" className="mt-3 min-h-11 shrink-0 rounded-xl border border-line bg-paper-raised px-3 text-sm font-semibold text-ink" onClick={() => navegar(rutaCompletado, { state: { pedidoId: estadoInicial.pedidoConfirmado } })}>Ver factura del pedido confirmado</button>}
        <section className="mt-3 flex-shrink-0">
          <div className="grid grid-cols-3 gap-2">
            {acciones.map((accion) => (
              <button
                key={accion.titulo}
                type="button"
                onClick={accion.onClick}
                className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-paper-raised p-3 text-left active:bg-paper-sunken"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accion.tono}`}>{accion.icono}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight text-ink">{accion.titulo}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-tight text-ink-soft">{accion.detalle}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Historial del día dentro de su propio contenedor con scroll */}
        <section className="mt-3.5 flex min-h-0 flex-1 flex-col pb-4">
          <div className="flex flex-shrink-0 items-center justify-between gap-2">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
              Pedidos de hoy
            </h2>
            <span className="text-[11.5px] text-ink-faint">Toca para gestionar</span>
          </div>

          <div className="mt-2 shrink-0"><BuscadorInput value={busqueda} onChange={(q) => { setBusqueda(q); setPagina(1); }} placeholder="Buscar pedido, cliente o vendedor" /></div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              {pedidosFiltrados.length === 0 ? (
                <ListaVacia
                  icono={<IconClipboard width={22} height={22} className="text-ink-faint" />}
                  titulo="Aún no hay pedidos hoy."
                  texto="Crea el primer pedido para verlo aquí."
                  accion={{ etiqueta: "Crear el primer pedido", onClick: () => navegar(rutaPedido) }}
                />
              ) : (
                <ul className="space-y-2">
                  {paginar(pedidosFiltrados, pagina).items.map((pedido) => {
                    const cliente = obtenerCliente(pedido.clienteId);
                    const porCobrarPedido = pedido.pago.saldoPendiente > 0;
                    return (
                      <li key={pedido.id}>
                        <button
                          type="button"
                          onClick={() => navegar(rutaDetalle(pedido.id))}
                          className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3 text-left active:bg-paper-sunken"
                        >
                          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${porCobrarPedido ? "bg-accent-soft text-accent-dark" : "bg-success-soft text-success"}`}>
                            <IconClipboard width={17} height={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-[12.5px] font-bold text-ink">{pedido.numero}</span>
                              <EtiquetaEstado estado={pedido.estado} compacta />
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{cliente?.nombre ?? "Venta ocasional"}</span>
                            <span className="mt-1 line-clamp-2 text-[11px] text-ink-soft">{pedido.lineas.map(l => `${l.cantidad} × ${l.nombre}`).join(" · ")}</span>
                            <span className="block truncate text-[10.5px] text-ink-faint">Generó {nombreUsuario(pedido.vendedorId)}</span>
                          </span>
                          <span className="flex flex-shrink-0 flex-col items-end gap-1">
                            <span className="font-mono text-[13px] font-semibold text-ink">{formatoMoneda(pedido.total)}</span>
                            <EtiquetaPago metodo={pedido.pago.metodo} pendiente={porCobrarPedido} compacta />
                          </span>
                          <IconChevronRight width={16} height={16} className="flex-shrink-0 text-ink-faint" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="shrink-0"><Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(pedidosFiltrados.length / POR_PAGINA))} total={pedidosFiltrados.length} porPagina={POR_PAGINA} onChange={setPagina} /></div>
        </section>
      </main>

      {clienteCreado && (
        <div className="flex-shrink-0 px-5 pb-3 md:px-6">
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-success px-4 py-2.5 text-[13px] font-semibold text-white shadow-md">
            <span className="min-w-0 truncate">Cliente “{clienteCreado}” creado ✓ Ya puedes crear su pedido</span>
            <button
              type="button"
              onClick={() => setClienteCreado(null)}
              className="flex-shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-[11.5px] font-bold active:bg-white/30"
            >
              Ok
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
