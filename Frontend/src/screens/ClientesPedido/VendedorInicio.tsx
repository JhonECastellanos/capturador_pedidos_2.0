import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconCash, IconClipboard, IconPackage, IconUser } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";
import { useOperaciones } from "../../context/OperacionesContext";
import { TarjetaAccion } from "../../modules/clientes-pedido/components/TarjetaAccion";
import { formatoMoneda } from "../../utils/formato";

export default function VendedorInicio() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, cerrarSesion } = useAuth();
  const { pedidos, movimientosCaja } = useOperaciones();

  const estadoInicial = ubicacion.state as { clienteCreado?: string } | null;
  const [clienteCreado, setClienteCreado] = useState<string | null>(estadoInicial?.clienteCreado ?? null);

  const hoy = useMemo(() => new Date(), []);
  const esHoy = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
  };

  const pedidosHoy = pedidos.filter((p) => esHoy(p.creadoEn) && p.estado !== "cancelado");
  const ventasHoy = pedidosHoy.reduce((total, pedido) => total + pedido.total, 0);
  const porCobrar = pedidos
    .filter((pedido) => pedido.estado !== "cancelado" && pedido.pago.saldoPendiente > 0)
    .reduce((suma, p) => suma + p.pago.saldoPendiente, 0);

  // Descuadre simple: lo cobrado en pedidos de contado de hoy vs lo que entró a caja por ellos.
  // Los pedidos a crédito se cobran por Abonos, así que no entran en esta comparación.
  const idsPedidosHoy = new Set(pedidosHoy.map((p) => p.id));
  const cobradoEnPedidosHoy = pedidosHoy
    .filter((p) => p.pago.metodo !== "credito")
    .reduce((suma, p) => suma + p.pago.montoRecibido, 0);
  const ingresosPorPedidosHoy = movimientosCaja
    .filter((m) => m.tipo === "ingreso" && esHoy(m.creadoEn) && m.referenciaId && idsPedidosHoy.has(m.referenciaId))
    .reduce((suma, m) => suma + m.monto, 0);
  const descuadre = cobradoEnPedidosHoy - ingresosPorPedidosHoy;

  function salir() {
    cerrarSesion();
    navegar("/");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 bg-ink px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] text-white md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-accent">Vendedor</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">Hola, {usuario?.nombre.split(" ")[0]}</h1>
            <p className="mt-1 text-[13px] text-white/70">Clientes, pedidos y cobros del día</p>
          </div>
          <button type="button" onClick={salir} className="rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/80">
            Salir
          </button>
        </div>
      </header>

      <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 pb-6 md:px-6">
        <section className="-mt-4 rounded-2xl bg-paper-raised p-4 shadow-[0_12px_28px_-16px_rgba(48,77,37,0.35)]">
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

        <section className="mt-6">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">Acciones rápidas</h2>
          <div className="mt-3 space-y-2.5">
            <TarjetaAccion
              titulo="Crear Pedido"
              descripcion="Cliente, productos, entrega y pago"
              icono={<IconPackage width={24} height={24} />}
              tono="acento"
              onClick={() => navegar("/vendedor/pedido")}
            />
            <TarjetaAccion
              titulo="Recibir Abono"
              descripcion="Cobra créditos pendientes y liquida saldos"
              icono={<IconCash width={24} height={24} />}
              tono="teal"
              onClick={() => navegar("/vendedor/abonos")}
            />
            <TarjetaAccion
              titulo="Crear Cliente"
              descripcion="Alta rápida con 5 datos"
              icono={<IconUser width={24} height={24} />}
              tono="teal"
              onClick={() => navegar("/vendedor/clientes/nuevo")}
            />
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">Pedidos de hoy</h2>
            <span className="text-[12px] text-ink-faint">Toca para gestionar</span>
          </div>
          {pedidosHoy.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center">
              <IconClipboard width={22} height={22} className="mx-auto text-ink-faint" />
              <p className="mt-2 text-[13px] text-ink-soft">Aún no hay pedidos hoy.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {pedidosHoy.map((pedido) => {
                const porPreparar = pedido.estado === "pendiente" || pedido.estado === "en-preparacion";
                return (
                  <li key={pedido.id}>
                    <button
                      type="button"
                      onClick={() => navegar(`/vendedor/pedido/${pedido.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5 text-left active:bg-paper-sunken"
                    >
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${porPreparar ? "bg-accent-soft text-accent-dark" : "bg-teal-soft text-teal"}`}>
                        <IconClipboard width={17} height={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">{pedido.numero}</span>
                        <span className="block truncate text-[12px] text-ink-soft">
                          {porPreparar ? "Por preparar" : "Entregado"} ·{" "}
                          {pedido.pago.saldoPendiente > 0
                            ? "crédito pendiente"
                            : pedido.pago.metodo === "credito"
                              ? "crédito pagado"
                              : `pagado por ${pedido.pago.metodo}`}
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className="block font-mono text-[13.5px] font-semibold text-ink">{formatoMoneda(pedido.total)}</span>
                        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          pedido.pago.saldoPendiente > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                        }`}>
                          {pedido.pago.saldoPendiente > 0 ? "Por cobrar" : "Pagado"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
