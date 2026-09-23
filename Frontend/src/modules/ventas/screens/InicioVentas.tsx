import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconCash, IconChevronRight, IconClipboard, IconPackage, IconUser } from "../../../components/Icons";
import { useAuth } from "../../../context/AuthContext";
import { useOperaciones } from "../../../context/OperacionesContext";
import { formatoMoneda } from "../../../utils/formato";
import { EtiquetaEstado } from "../../administracion/components/EtiquetaEstado";

interface InicioVentasProps {
  /** Asistente para tomar un pedido. */
  rutaPedido: string;
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
export function InicioVentas({ rutaPedido, rutaAbonos, rutaNuevoCliente, rutaDetalle, etiquetaRol, descripcion }: InicioVentasProps) {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, cerrarSesion } = useAuth();
  const { pedidos, movimientosCaja, obtenerCliente, nombreUsuario } = useOperaciones();

  const estadoInicial = ubicacion.state as { clienteCreado?: string } | null;
  const [clienteCreado, setClienteCreado] = useState<string | null>(estadoInicial?.clienteCreado ?? null);

  const hoy = useMemo(() => new Date(), []);

  const pedidosHoy = useMemo(
    () =>
      pedidos
        .filter((p) => esMismoDia(p.creadoEn, hoy) && p.estado !== "cancelado")
        .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0)),
    [pedidos, hoy],
  );
  const ventasHoy = pedidosHoy.reduce((total, pedido) => total + pedido.total, 0);
  const porCobrar = pedidos
    .filter((pedido) => pedido.estado !== "cancelado" && pedido.pago.saldoPendiente > 0)
    .reduce((suma, p) => suma + p.pago.saldoPendiente, 0);

  // Descuadre del día: lo cobrado en pedidos de contado vs lo que entró a caja por ellos.
  // Los pedidos a crédito se cobran por Abonos, así que no entran en esta comparación.
  const idsPedidosHoy = new Set(pedidosHoy.map((p) => p.id));
  const cobradoEnPedidosHoy = pedidosHoy
    .filter((p) => p.pago.metodo !== "credito")
    .reduce((suma, p) => suma + p.pago.montoRecibido, 0);
  const ingresosPorPedidosHoy = movimientosCaja
    .filter((m) => m.tipo === "ingreso" && esMismoDia(m.creadoEn, hoy) && m.referenciaId && idsPedidosHoy.has(m.referenciaId))
    .reduce((suma, m) => suma + m.monto, 0);
  const descuadre = cobradoEnPedidosHoy - ingresosPorPedidosHoy;

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

  function salir() {
    cerrarSesion();
    navegar("/");
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <header className="flex-shrink-0 bg-ink px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] text-white md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-accent">{etiquetaRol}</p>
            <h1 className="mt-1 truncate font-display text-2xl font-semibold">Hola, {usuario?.nombre.split(" ")[0]}</h1>
            <p className="mt-1 text-[13px] text-white/70">{descripcion}</p>
          </div>
          <button type="button" onClick={salir} className="flex-shrink-0 rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/80">
            Salir
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-5 md:px-6">
        <section className="-mt-4 flex-shrink-0 rounded-2xl bg-paper-raised p-4 shadow-[0_12px_28px_-16px_rgba(48,77,37,0.35)]">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen de la jornada</p>
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
                {descuadre === 0 ? "Cuadra ✓" : formatoMoneda(descuadre)}
              </p>
              <p className="text-[12px] text-ink-soft">Descuadre de caja</p>
            </div>
          </div>
        </section>

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
              Pedidos de hoy ({pedidosHoy.length})
            </h2>
            <span className="text-[11.5px] text-ink-faint">Toca para gestionar</span>
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              {pedidosHoy.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-10 text-center">
                  <IconClipboard width={22} height={22} className="text-ink-faint" />
                  <p className="mt-2 text-[13px] text-ink-soft">Aún no hay pedidos hoy.</p>
                  <button type="button" onClick={() => navegar(rutaPedido)} className="mt-3 rounded-xl bg-ink px-4 py-2 text-[12.5px] font-semibold text-white active:bg-ink/90">
                    Crear el primer pedido
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pedidosHoy.map((pedido) => {
                    const cliente = obtenerCliente(pedido.clienteId);
                    const porCobrarPedido = pedido.pago.saldoPendiente > 0;
                    const textoPago = porCobrarPedido
                      ? "Por cobrar"
                      : pedido.pago.metodo === "credito"
                        ? "Crédito pagado"
                        : `Pagado · ${pedido.pago.metodo}`;
                    const clasePago = porCobrarPedido
                      ? "bg-danger-soft text-danger"
                      : pedido.pago.metodo === "nequi"
                        ? "bg-teal-soft text-teal"
                        : "bg-success-soft text-success";
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
                            <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{cliente?.nombre ?? "Cliente"}</span>
                            <span className="block truncate text-[10.5px] text-ink-faint">Generó {nombreUsuario(pedido.vendedorId)}</span>
                          </span>
                          <span className="flex flex-shrink-0 flex-col items-end gap-1">
                            <span className="font-mono text-[13px] font-semibold text-ink">{formatoMoneda(pedido.total)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${clasePago}`}>{textoPago}</span>
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
