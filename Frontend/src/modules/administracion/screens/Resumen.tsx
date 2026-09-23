import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { limpiarTodo } from "../../../data/repositorios/almacenamiento";
import { useOperaciones } from "../../../context/OperacionesContext";
import { formatoMoneda } from "../../../utils/formato";
import { TarjetaMetrica } from "../components/TarjetaMetrica";

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

export function Resumen() {
  const navegar = useNavigate();
  const { pedidos, inventario, movimientosCaja, conteos, obtenerCliente } = useOperaciones();
  const hoy = useMemo(() => new Date(), []);

  const ingresos = movimientosCaja.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const pendientes = pedidos.filter((p) => p.pago.saldoPendiente > 0).reduce((s, p) => s + p.pago.saldoPendiente, 0);
  const alertasStock = inventario.filter((p) => p.stock <= p.stockMinimo).length;

  const pedidosHoy = pedidos.filter((p) => esHoy(p.creadoEn, hoy) && p.estado !== "cancelado");
  const pedidosAyer = pedidos.filter((p) => esAyer(p.creadoEn, hoy) && p.estado !== "cancelado");
  const ventasHoy = pedidosHoy.reduce((s, p) => s + p.total, 0);
  const ventasAyer = pedidosAyer.reduce((s, p) => s + p.total, 0);
  const ticketPromedio = pedidosHoy.length ? ventasHoy / pedidosHoy.length : 0;
  const descuadres = conteos.filter((c) => c.estado === "confirmado").flatMap((c) => c.lineas).filter((l) => l.diferencia !== 0).length;

  const ultimos7 = useMemo(() => {
    const dias: { etiqueta: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      const total = pedidos.filter((p) => esHoy(p.creadoEn, d) && p.estado !== "cancelado").reduce((s, p) => s + p.total, 0);
      dias.push({ etiqueta: d.toLocaleDateString("es-CO", { weekday: "short" }), total });
    }
    return dias;
  }, [hoy, pedidos]);
  const max7 = Math.max(1, ...ultimos7.map((d) => d.total));

  const topProductos = useMemo(() => {
    const mapa = new Map<string, number>();
    pedidos.forEach((pedido) => pedido.lineas.forEach((l) => mapa.set(l.nombre, (mapa.get(l.nombre) ?? 0) + l.cantidad)));
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [pedidos]);

  const topClientes = useMemo(() => {
    const mapa = new Map<string, number>();
    pedidos.forEach((p) => mapa.set(p.clienteId, (mapa.get(p.clienteId) ?? 0) + p.total));
    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([clienteId, total]) => ({ cliente: obtenerCliente(clienteId), total }));
  }, [obtenerCliente, pedidos]);

  const variacion = ventasAyer > 0 ? ((ventasHoy - ventasAyer) / ventasAyer) * 100 : ventasHoy > 0 ? 100 : 0;

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Inicio</h2>
          <GuiaAyuda
            pantalla="Inicio"
            pasos={[
              { titulo: "1 · KPIs del día", texto: "Ventas hoy, crédito pendiente, ticket promedio y alertas de stock. Todo se calcula en vivo." },
              { titulo: "2 · Hoy vs ayer y gráfica", texto: "Compara ventas hoy contra ayer y revisa los últimos 7 días en barras. Toca para ver el detalle." },
              { titulo: "3 · Tops y acciones", texto: "Top productos y clientes con acceso directo a Inventario y Pedidos. Usa Acciones prioritarias para créditos y cierre." },
            ]}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-2 space-y-4">
      {/* KPIs principales */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:max-w-3xl">
        <TarjetaMetrica etiqueta="Ventas hoy" valor={formatoMoneda(ventasHoy)} tono="teal" />
        <TarjetaMetrica etiqueta="Pendiente crédito" valor={formatoMoneda(pendientes)} tono="danger" />
        <TarjetaMetrica etiqueta="Ticket promedio" valor={formatoMoneda(ticketPromedio)} tono="ink" />
        <TarjetaMetrica etiqueta="Alertas stock" valor={String(alertasStock)} tono="accent" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:max-w-3xl">
        <div className="rounded-xl border border-line bg-paper-raised p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Hoy vs ayer</p>
          <p className="mt-1 font-mono text-[15px] font-semibold text-ink">{formatoMoneda(ventasHoy)} <span className={`text-[11px] ${variacion >= 0 ? "text-success" : "text-danger"}`}>{variacion >= 0 ? "+" : ""}{variacion.toFixed(1)}%</span></p>
          <p className="text-[11px] text-ink-soft">Ayer {formatoMoneda(ventasAyer)} · {pedidosHoy.length} pedidos hoy</p>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Cartera y descuadres</p>
          <p className="mt-1 font-mono text-[15px] font-semibold text-ink">{descuadres} descuadres</p>
          <p className="text-[11px] text-ink-soft">Cartera {formatoMoneda(pendientes)} por cobrar</p>
        </div>
      </div>

      {/* Gráfica barras CSS puro últimos 7 días */}
      <div className="mt-6 max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
        <p className="font-display text-[14px] font-semibold text-ink">Ventas últimos 7 días</p>
        <div className="mt-3 flex items-end gap-2">
          {ultimos7.map((dia) => (
            <div key={dia.etiqueta} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end justify-center">
                <div className="w-full max-w-10 rounded-t-lg bg-ink transition-all" style={{ height: `${(dia.total / max7) * 100}%`, minHeight: dia.total > 0 ? "8px" : "2px", background: dia.total === ventasHoy ? "var(--color-accent)" : "var(--color-ink)" }} />
              </div>
              <span className="text-[10px] font-medium capitalize text-ink-soft">{dia.etiqueta.slice(0, 3)}</span>
              <span className="font-mono text-[10px] text-ink-faint">{dia.total > 0 ? formatoMoneda(dia.total).replace("$", "") : "—"}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">Barras en CSS puro, sin dependencias · cobrado {formatoMoneda(ingresos)}</p>
      </div>

      <div className="mt-4 grid gap-3 lg:max-w-3xl lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper-raised p-4">
          <p className="font-display text-[13px] font-semibold text-ink">Top productos</p>
          {topProductos.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-soft">Sin ventas aún.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {topProductos.map(([nombre, cantidad]) => (
                <li key={nombre} className="flex justify-between py-2 text-[12.5px]">
                  <span className="truncate pr-3 text-ink">{nombre}</span>
                  <span className="font-mono font-semibold text-ink">{cantidad} u</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => navegar("/admin/inventario")} className="mt-2 text-[12px] font-semibold text-teal underline">Ver inventario →</button>
        </div>
        <div className="rounded-2xl border border-line bg-paper-raised p-4">
          <p className="font-display text-[13px] font-semibold text-ink">Top clientes</p>
          {topClientes.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-soft">Sin clientes aún.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {topClientes.map(({ cliente, total }) => (
                <li key={cliente?.id ?? total} className="flex justify-between py-2 text-[12.5px]">
                  <span className="truncate pr-3 text-ink">{cliente?.nombre ?? "Cliente"}</span>
                  <span className="font-mono font-semibold text-ink">{formatoMoneda(total)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => navegar("/admin/pedidos")} className="mt-2 text-[12px] font-semibold text-teal underline">Ver pedidos →</button>
        </div>
      </div>

      <div className="mt-6 max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
        <p className="font-display text-[16px] font-semibold text-ink">Acciones prioritarias</p>
        <div className="mt-3 space-y-2">
          {pendientes > 0 && (
            <button
              type="button"
              onClick={() => navegar("/admin/creditos")}
              className="flex w-full items-center justify-between rounded-xl bg-danger-soft px-3 py-3 text-left text-[13px] text-danger active:opacity-80"
            >
              <span>Cobrar créditos pendientes</span>
              <strong>{formatoMoneda(pendientes)}</strong>
            </button>
          )}
          <button
            type="button"
            onClick={() => navegar("/admin/cierre")}
            className="flex w-full items-center justify-between rounded-xl bg-paper-sunken px-3 py-3 text-left text-[13px] text-ink active:opacity-80"
          >
            <span>Validar inventario y cierre diario</span>
            <span>→</span>
          </button>
          <button type="button" onClick={() => navegar("/admin/compras")} className="flex w-full items-center justify-between rounded-xl bg-teal-soft px-3 py-3 text-left text-[13px] text-teal active:opacity-80">
            <span>Registrar compra y actualizar costos</span>
            <span>→</span>
          </button>
        </div>
      </div>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => {
            const confirmar = window.confirm("¿Reiniciar datos de demostración? Se borrará todo y se recargará la página.");
            if (!confirmar) return;
            limpiarTodo();
            window.location.reload();
          }}
          className="text-[11.5px] font-medium text-ink-faint underline active:text-ink"
        >
          Utilidad dev: reiniciar seed (borrar localStorage)
        </button>
      </div>
    </div>
    </div>
  );
}
