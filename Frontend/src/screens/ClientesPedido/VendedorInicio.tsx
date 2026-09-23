import { useNavigate } from "react-router-dom";
import { IconClipboard, IconPackage, IconUser } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";
import { useOperaciones } from "../../context/OperacionesContext";
import { TarjetaAccion } from "../../modules/clientes-pedido/components/TarjetaAccion";
import { formatoMoneda } from "../../utils/formato";

export default function VendedorInicio() {
  const navegar = useNavigate();
  const { usuario, cerrarSesion } = useAuth();
  const { pedidos } = useOperaciones();
  const esHoy = (iso: string) => {
    const d = new Date(iso);
    const h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
  };
  const pedidosHoy = pedidos.filter((p) => esHoy(p.creadoEn) && p.estado !== "cancelado");
  const ventasHoy = pedidosHoy.reduce((total, pedido) => total + pedido.total, 0);
  const porCobrar = pedidos.filter((pedido) => pedido.estado !== "cancelado" && pedido.pago.saldoPendiente > 0).reduce((s, p) => s + p.pago.saldoPendiente, 0);

  function salir() {
    cerrarSesion();
    navegar("/");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 bg-ink px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] text-white md:px-6">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] text-accent">Vendedor</p><h1 className="mt-1 font-display text-2xl font-semibold">Hola, {usuario?.nombre.split(" ")[0]}</h1><p className="mt-1 text-[13px] text-white/60">Clientes, pedidos y cobros del día</p></div><button type="button" onClick={salir} className="rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/80">Salir</button></div>
      </header>

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 md:px-6">
        <section className="-mt-4 rounded-2xl bg-paper-raised p-4 shadow-[0_12px_28px_-16px_rgba(48,77,37,0.35)]">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen de la jornada</p>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <div><p className="font-mono text-[16px] font-semibold text-ink">{pedidosHoy.length}</p><p className="text-[12px] text-ink-soft">Pedidos hoy</p></div>
            <div><p className="font-mono text-[16px] font-semibold text-ink">{formatoMoneda(ventasHoy)}</p><p className="text-[12px] text-ink-soft">Ventas hoy</p></div>
            <div><p className="font-mono text-[16px] font-semibold text-danger">{formatoMoneda(porCobrar)}</p><p className="text-[12px] text-ink-soft">Por cobrar</p></div>
          </div>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">Acciones rápidas</h2>
          <div className="mt-3 space-y-2.5">
            <TarjetaAccion titulo="Crear Cliente" descripcion="Guarda un alias para reconocerlo al instante" icono={<IconUser width={24} height={24} />} tono="teal" onClick={() => navegar("/vendedor/clientes/nuevo")} />
            <TarjetaAccion titulo="Crear Pedido" descripcion="Selecciona cliente, productos y forma de pago" icono={<IconPackage width={24} height={24} />} tono="acento" onClick={() => navegar("/vendedor/pedido")} />
          </div>
        </section>

        <section className="mt-7">
          <div className="flex items-center justify-between"><h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">Seguimiento de cobros</h2><span className="text-[12px] text-ink-faint">Estado actual</span></div>
          {pedidos.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center"><IconClipboard width={22} height={22} className="mx-auto text-ink-faint" /><p className="mt-2 text-[13px] text-ink-soft">Los pedidos capturados aparecerán aquí.</p></div>
          ) : (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper-raised">
              {pedidos.slice(0, 3).map((pedido) => <li key={pedido.id} className="flex items-center gap-3 px-4 py-3.5"><div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal"><IconClipboard width={17} height={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium text-ink">{pedido.numero}</p><p className="text-[12.5px] capitalize text-ink-soft">{pedido.pago.saldoPendiente > 0 ? "Crédito pendiente" : `Pagado por ${pedido.pago.metodo}`}</p></div><div className="text-right"><p className="font-mono text-[13.5px] font-semibold text-ink">{formatoMoneda(pedido.total)}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${pedido.pago.saldoPendiente > 0 ? "bg-danger-soft text-danger" : pedido.pago.metodo === "nequi" ? "bg-teal-soft text-teal" : "bg-success-soft text-success"}`}>{pedido.pago.saldoPendiente > 0 ? "Por cobrar" : pedido.pago.metodo}</span></div></li>)}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
