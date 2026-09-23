import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { limpiarTodo } from "../../../data/repositorios/almacenamiento";
import { useOperaciones } from "../../../context/OperacionesContext";
import { formatoMoneda, formatoMonedaCorta } from "../../../utils/formato";
import { dentroDePeriodo, dentroDeTramo, tramosDe, type Granularidad, type PeriodoLista, type Tramo } from "../../../utils/periodos";
import { GraficaBarrasDobles } from "../components/GraficaBarrasDobles";
import { GraficaLinea } from "../components/GraficaLinea";
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

const GRANULARIDADES: Array<{ valor: Granularidad; etiqueta: string }> = [
  { valor: "dia", etiqueta: "Día" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
  { valor: "anio", etiqueta: "Año" },
];

const PERIODOS_TOPS: Array<{ valor: PeriodoLista; etiqueta: string }> = [
  { valor: "dia", etiqueta: "Día" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
  { valor: "anio", etiqueta: "Año" },
  { valor: "todo", etiqueta: "Todo" },
];

/** Chips compactos de tiempo, iguales a los del resto de los módulos. */
function FiltroPeriodo<T extends string>({ opciones, valor, onChange }: { opciones: Array<{ valor: T; etiqueta: string }>; valor: T; onChange: (valor: T) => void }) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          onClick={() => onChange(opcion.valor)}
          className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            valor === opcion.valor ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"
          }`}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function Resumen() {
  const navegar = useNavigate();
  const { pedidos, inventario, recepciones, gastos, obtenerCliente } = useOperaciones();
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const [granBarras, setGranBarras] = useState<Granularidad>("dia");
  const [granLinea, setGranLinea] = useState<Granularidad>("dia");
  const [periodoTops, setPeriodoTops] = useState<PeriodoLista>("todo");
  const hoy = useMemo(() => new Date(), []);

  const pedidosValidos = pedidos.filter((p) => p.estado !== "cancelado");
  const pedidosHoy = pedidosValidos.filter((p) => esHoy(p.creadoEn, hoy));
  const pedidosAyer = pedidosValidos.filter((p) => esAyer(p.creadoEn, hoy));
  const ventasHoy = pedidosHoy.reduce((s, p) => s + p.total, 0);
  const ventasAyer = pedidosAyer.reduce((s, p) => s + p.total, 0);
  const gastosHoy = gastos.filter((g) => esHoy(g.creadoEn, hoy)).reduce((s, g) => s + g.monto, 0);
  const comprasHoy = recepciones.filter((r) => esHoy(r.creadoEn, hoy)).reduce((s, r) => s + r.total, 0);
  const ticketPromedio = pedidosHoy.length ? ventasHoy / pedidosHoy.length : 0;
  const alertasStock = inventario.filter((p) => p.stock <= p.stockMinimo).length;
  const pendientes = pedidosValidos.filter((p) => p.pago.saldoPendiente > 0).reduce((s, p) => s + p.pago.saldoPendiente, 0);
  const variacion = ventasAyer > 0 ? ((ventasHoy - ventasAyer) / ventasAyer) * 100 : ventasHoy > 0 ? 100 : 0;

  /** Serie de tiempo: ventas contra compras + gastos, y la rentabilidad que queda. */
  function serieDe(tramos: Tramo[]) {
    return tramos.map((tramo) => {
      const ventas = pedidosValidos.filter((p) => dentroDeTramo(p.creadoEn, tramo)).reduce((s, p) => s + p.total, 0);
      const compras = recepciones.filter((r) => dentroDeTramo(r.creadoEn, tramo)).reduce((s, r) => s + r.total, 0);
      const gastosTramo = gastos.filter((g) => dentroDeTramo(g.creadoEn, tramo)).reduce((s, g) => s + g.monto, 0);
      return {
        etiqueta: tramo.etiqueta,
        ventas,
        egresos: compras + gastosTramo,
        rentabilidad: ventas - compras - gastosTramo,
      };
    });
  }

  const serieBarras = serieDe(tramosDe(granBarras, hoy));
  const serieLinea = serieDe(tramosDe(granLinea, hoy));
  const puntosRentabilidad = serieLinea.map((punto) => ({ etiqueta: punto.etiqueta, valor: punto.rentabilidad }));
  const totalVentasBarras = serieBarras.reduce((s, punto) => s + punto.ventas, 0);
  const totalEgresosBarras = serieBarras.reduce((s, punto) => s + punto.egresos, 0);
  const rentabilidadPeriodo = serieLinea.reduce((s, punto) => s + punto.rentabilidad, 0);

  // La ganancia usa el último costo conocido del producto: alcanza para ver el margen real por venta.
  function costoDe(productoId: string, nombre: string): number {
    const producto = inventario.find((p) => p.id === productoId) ?? inventario.find((p) => p.nombre === nombre);
    return producto?.costoActual ?? 0;
  }

  const pedidosPeriodo = pedidosValidos.filter((p) => dentroDePeriodo(p.creadoEn, periodoTops, hoy));

  const mapaProductos = new Map<string, { nombre: string; unidades: number; venta: number; ganancia: number }>();
  pedidosPeriodo.forEach((pedido) =>
    pedido.lineas.forEach((linea) => {
      const fila = mapaProductos.get(linea.productoId) ?? { nombre: linea.nombre, unidades: 0, venta: 0, ganancia: 0 };
      fila.unidades += linea.cantidad;
      fila.venta += linea.subtotal;
      fila.ganancia += (linea.precioUnitario - costoDe(linea.productoId, linea.nombre)) * linea.cantidad;
      mapaProductos.set(linea.productoId, fila);
    }),
  );
  const topProductos = [...mapaProductos.values()].sort((a, b) => b.venta - a.venta).slice(0, 5);

  const mapaClientes = new Map<string, { comprado: number; ganancia: number; pedidos: number }>();
  pedidosPeriodo.forEach((pedido) => {
    const fila = mapaClientes.get(pedido.clienteId) ?? { comprado: 0, ganancia: 0, pedidos: 0 };
    fila.comprado += pedido.total;
    fila.pedidos += 1;
    fila.ganancia += pedido.lineas.reduce((s, linea) => s + (linea.precioUnitario - costoDe(linea.productoId, linea.nombre)) * linea.cantidad, 0);
    mapaClientes.set(pedido.clienteId, fila);
  });
  const topClientes = [...mapaClientes.entries()]
    .sort((a, b) => b[1].comprado - a[1].comprado)
    .slice(0, 5)
    .map(([clienteId, fila]) => ({ clienteId, ...fila, cliente: obtenerCliente(clienteId) }));

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Inicio</h2>
          <GuiaAyuda
            pantalla="Inicio"
            pasos={[
              { titulo: "1 · KPIs del día", texto: "Ventas, gastos, compras, ticket promedio, crédito pendiente y alertas de stock de hoy." },
              { titulo: "2 · Gráficas con filtro", texto: "Ventas contra compras y gastos, y la rentabilidad que queda. Cambia el filtro a día, semana, mes o año: el eje X siempre es el tiempo." },
              { titulo: "3 · Tops con ganancia", texto: "Los 5 productos y clientes que más mueven el negocio, con lo vendido y la ganancia real (costo conocido). Filtra por día, semana, mes, año o todo." },
            ]}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-2 space-y-4">
      {/* KPIs del día */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:max-w-3xl lg:grid-cols-3">
        <TarjetaMetrica etiqueta="Ventas hoy" valor={formatoMoneda(ventasHoy)} tono="teal" />
        <TarjetaMetrica etiqueta="Gastos hoy" valor={formatoMoneda(gastosHoy)} tono="danger" />
        <TarjetaMetrica etiqueta="Compras hoy" valor={formatoMoneda(comprasHoy)} tono="accent" />
        <TarjetaMetrica etiqueta="Ticket promedio" valor={formatoMoneda(ticketPromedio)} tono="ink" />
        <TarjetaMetrica etiqueta="Pendiente crédito" valor={formatoMoneda(pendientes)} tono="danger" />
        <TarjetaMetrica etiqueta="Alertas stock" valor={String(alertasStock)} tono="accent" />
      </div>

      <div className="mt-3 max-w-3xl rounded-xl border border-line bg-paper-raised p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Hoy vs ayer</p>
        <p className="mt-1 font-mono text-[15px] font-semibold text-ink">
          {formatoMoneda(ventasHoy)}{" "}
          <span className={`text-[11px] ${variacion >= 0 ? "text-success" : "text-danger"}`}>
            {variacion >= 0 ? "+" : ""}
            {variacion.toFixed(1)}%
          </span>
        </p>
        <p className="text-[11px] text-ink-soft">Ayer {formatoMoneda(ventasAyer)} · {pedidosHoy.length} pedidos hoy</p>
      </div>

      {/* Gráfica 1: ventas contra compras y gastos, en la línea de tiempo */}
      <div className="mt-6 max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-[14px] font-semibold text-ink">Ventas vs compras y gastos</p>
          <FiltroPeriodo opciones={GRANULARIDADES} valor={granBarras} onChange={setGranBarras} />
        </div>
        <GraficaBarrasDobles datos={serieBarras} formato={formatoMonedaCorta} />
        <p className="mt-2 text-[11px] text-ink-faint">
          Barras en CSS puro, sin dependencias · ventas {formatoMoneda(totalVentasBarras)} · compras y gastos {formatoMoneda(totalEgresosBarras)}
        </p>
      </div>

      {/* Gráfica 2: rentabilidad en el tiempo */}
      <div className="mt-4 max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-[14px] font-semibold text-ink">Rentabilidad</p>
            <p className="text-[11px] text-ink-soft">Ganancia después de compras y gastos</p>
          </div>
          <FiltroPeriodo opciones={GRANULARIDADES} valor={granLinea} onChange={setGranLinea} />
        </div>
        <GraficaLinea datos={puntosRentabilidad} formato={formatoMonedaCorta} />
        <p className="mt-2 text-[11px] text-ink-faint">Rentabilidad del periodo {formatoMoneda(rentabilidadPeriodo)}</p>
      </div>

      <div className="mt-4 grid gap-3 lg:max-w-3xl lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[13px] font-semibold text-ink">Top productos</p>
            <FiltroPeriodo opciones={PERIODOS_TOPS} valor={periodoTops} onChange={setPeriodoTops} />
          </div>
          {topProductos.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-soft">Sin ventas en este periodo.</p>
          ) : (
            <>
              <div className="mt-2.5 grid grid-cols-[1fr_4.5rem_4.5rem] gap-1.5 border-b border-line pb-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">
                <span>Producto</span>
                <span className="text-right">Vendido</span>
                <span className="text-right">Ganancia</span>
              </div>
              <ul className="divide-y divide-line">
                {topProductos.map((fila) => (
                  <li key={fila.nombre} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-1.5 py-2 text-[12px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{fila.nombre}</span>
                      <span className="block text-[10px] text-ink-faint">{fila.unidades} u vendidas</span>
                    </span>
                    <span className="text-right font-mono font-semibold text-ink">{formatoMoneda(fila.venta)}</span>
                    <span className="text-right">
                      <span className="block font-mono font-semibold text-success">{formatoMoneda(fila.ganancia)}</span>
                      <span className="block text-[10px] text-success/80">{fila.venta > 0 ? Math.round((fila.ganancia / fila.venta) * 100) : 0}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => navegar("/admin/inventario")} className="mt-2 text-[12px] font-semibold text-teal underline">Ver inventario →</button>
        </div>
        <div className="rounded-2xl border border-line bg-paper-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[13px] font-semibold text-ink">Top clientes</p>
            <FiltroPeriodo opciones={PERIODOS_TOPS} valor={periodoTops} onChange={setPeriodoTops} />
          </div>
          {topClientes.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-soft">Sin ventas en este periodo.</p>
          ) : (
            <>
              <div className="mt-2.5 grid grid-cols-[1fr_4.5rem_4.5rem] gap-1.5 border-b border-line pb-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">
                <span>Cliente</span>
                <span className="text-right">Compró</span>
                <span className="text-right">Ganancia</span>
              </div>
              <ul className="divide-y divide-line">
                {topClientes.map((fila) => (
                  <li key={fila.clienteId} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-1.5 py-2 text-[12px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{fila.cliente?.nombre ?? "Cliente"}</span>
                      <span className="block text-[10px] text-ink-faint">{fila.pedidos} pedido(s)</span>
                    </span>
                    <span className="text-right font-mono font-semibold text-ink">{formatoMoneda(fila.comprado)}</span>
                    <span className="text-right">
                      <span className="block font-mono font-semibold text-success">{formatoMoneda(fila.ganancia)}</span>
                      <span className="block text-[10px] text-success/80">{fila.comprado > 0 ? Math.round((fila.ganancia / fila.comprado) * 100) : 0}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => navegar("/admin/pedidos")} className="mt-2 text-[12px] font-semibold text-teal underline">Ver pedidos →</button>
        </div>
      </div>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setConfirmarReinicio(true)}
          className="text-[11.5px] font-medium text-ink-faint underline active:text-ink"
        >
          Utilidad dev: borrar todos los datos (dejar la app en cero)
        </button>
      </div>

      <ConfirmarAccion
        abierto={confirmarReinicio}
        titulo="Borrar todos los datos"
        mensaje="Se borrarán los datos del negocio (clientes, productos, pedidos, inventario, caja, créditos y cierres). La app quedará como recién instalada; los dos accesos oficiales se conservan."
        textoConfirmar="Sí, borrar"
        tono="peligro"
        alCancelar={() => setConfirmarReinicio(false)}
        alConfirmar={() => {
          limpiarTodo();
          window.location.reload();
        }}
      />
    </div>
    </div>
  );
}
