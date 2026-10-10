import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { ListaVacia } from "../../../components/ListaVacia";
import { SegmentoControl } from "../../../components/SegmentoControl";
import { UtilidadDev } from "../../../components/UtilidadDev";
import { useOperaciones } from "../../../context/operaciones";
import { topClientesDe, topProductosDe } from "../../../dominio/servicios";
import { esAyer, esMismoDia, fechaOperativa } from "../../../utils/fechas";
import { formatoMoneda } from "../../../utils/formato";
import { dentroDePeriodo, dentroDeTramo, tramosDe, type Granularidad, type PeriodoLista, type Tramo } from "../../../utils/periodos";
import { GraficaBarrasDobles } from "../components/GraficaBarrasDobles";
import { GraficaLinea } from "../components/GraficaLinea";
import { TarjetaMetrica } from "../components/TarjetaMetrica";
import { usaApi } from "../../../data/api";
import { useResumenApi } from "../../../data/useResumenApi";
import { diaTablero, rangoTramos, serieTablero } from "../../../utils/tablero";

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

export function Resumen() {
  const navegar = useNavigate();
  const { pedidos, inventario, recepciones, gastos, obtenerCliente } = useOperaciones();
  const [granBarras, setGranBarras] = useState<Granularidad>("dia");
  const [granLinea, setGranLinea] = useState<Granularidad>("dia");
  const [granDescuadres, setGranDescuadres] = useState<Granularidad>("dia");
  const [periodoTops, setPeriodoTops] = useState<PeriodoLista>("todo");
  const hoy = useMemo(() => new Date(), []);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  const tramosBarras = tramosDe(granBarras, hoy), tramosLinea = tramosDe(granLinea, hoy);
  const rangoBarras = rangoTramos(tramosBarras), rangoLinea = rangoTramos(tramosLinea);
  const tramosDescuadres = tramosDe(granDescuadres, hoy);
  const remotoDescuadres = useResumenApi(...rangoTramos(tramosDescuadres));
  const serieDescuadres = tramosDescuadres.map(tramo => {
    const desde = diaTablero(tramo.inicio), hasta = diaTablero(tramo.fin);
    const filas = remotoDescuadres.data?.descuadres.serie.filter(f => f.dia >= desde && f.dia < hasta) ?? [];
    return { etiqueta: tramo.etiqueta, ventas: filas.reduce((s, f) => s + f.sobrantes, 0), egresos: filas.reduce((s, f) => s + f.faltantes, 0) };
  });
  const inicioTops = new Date(hoy);
  inicioTops.setDate(inicioTops.getDate() - (periodoTops === "dia" ? 0 : periodoTops === "semana" ? 7 : periodoTops === "mes" ? 30 : 365));
  const remotoHoy = useResumenApi(diaTablero(hoy), diaTablero(hoy));
  const diaMes = hoy.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const inicioMes = `${diaMes.slice(0, 7)}-01`;
  const remotoMes = useResumenApi(inicioMes, diaMes);
  const remotoAyer = useResumenApi(diaTablero(ayer), diaTablero(ayer));
  const remotoBarras = useResumenApi(...rangoBarras);
  const remotoLinea = useResumenApi(...rangoLinea);
  const remotoTops = useResumenApi(periodoTops === "todo" ? "1900-01-01" : diaTablero(inicioTops), diaTablero(hoy), true);

  const pedidosValidos = pedidos.filter((p) => p.estado !== "cancelado");
  const pedidosHoy = pedidosValidos.filter((p) => esMismoDia(fechaOperativa(p), hoy));
  const pedidosAyer = pedidosValidos.filter((p) => esAyer(fechaOperativa(p), hoy));
  const cantidadHoy = usaApi ? remotoHoy.data?.pedidos ?? 0 : pedidosHoy.length;
  const cantidadAyer = usaApi ? remotoAyer.data?.pedidos ?? 0 : pedidosAyer.length;
  const ventasHoy = usaApi ? remotoHoy.data?.ventas ?? 0 : pedidosHoy.reduce((s, p) => s + p.total, 0);
  const ventasAyer = usaApi ? remotoAyer.data?.ventas ?? 0 : pedidosAyer.reduce((s, p) => s + p.total, 0);
  const gastosHoy = usaApi ? remotoHoy.data?.gastos ?? 0 : gastos.filter((g) => esMismoDia(g.creadoEn, hoy)).reduce((s, g) => s + g.monto, 0);
  const comprasHoy = usaApi ? remotoHoy.data?.compras ?? 0 : recepciones.filter((r) => esMismoDia(r.creadoEn, hoy)).reduce((s, r) => s + r.total, 0);
  const ticketPromedio = usaApi ? remotoHoy.data?.ticketPromedio ?? 0 : pedidosHoy.length ? ventasHoy / pedidosHoy.length : 0;
  const delMes = (registro: { creadoEn: string; fechaOperacion?: string }) => { const dia = registro.fechaOperacion?.slice(0, 10) ?? new Date(registro.creadoEn).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); return dia >= inicioMes && dia <= diaMes; };
  const pedidosMes = pedidosValidos.filter(delMes);
  const ventasMes = usaApi ? remotoMes.data?.ventas ?? 0 : pedidosMes.reduce((s, p) => s + p.total, 0);
  const gastosMes = usaApi ? remotoMes.data?.gastos ?? 0 : gastos.filter(delMes).reduce((s, g) => s + g.monto, 0);
  const comprasMes = usaApi ? remotoMes.data?.compras ?? 0 : recepciones.filter(delMes).reduce((s, r) => s + r.total, 0);
  const ticketMes = usaApi ? remotoMes.data?.ticketPromedio ?? 0 : pedidosMes.length ? ventasMes / pedidosMes.length : 0;
  const alertasStock = usaApi ? remotoHoy.data?.alertasStock ?? 0 : inventario.filter((p) => p.stock <= p.stockMinimo).length;
  const pendientes = usaApi ? remotoHoy.data?.creditoPendienteGlobal ?? 0 : pedidosValidos.filter((p) => p.pago.saldoPendiente > 0).reduce((s, p) => s + p.pago.saldoPendiente, 0);
  const variacion = ventasAyer > 0 ? ((ventasHoy - ventasAyer) / ventasAyer) * 100 : ventasHoy > 0 ? 100 : 0;

  /** Serie de tiempo: ventas contra compras + gastos, y la rentabilidad que queda. */
  function serieDe(tramos: Tramo[]) {
    return tramos.map((tramo) => {
      const ventas = pedidosValidos.filter((p) => dentroDeTramo(fechaOperativa(p), tramo)).reduce((s, p) => s + p.total, 0);
      const compras = recepciones.filter((r) => dentroDeTramo(r.creadoEn, tramo)).reduce((s, r) => s + r.total, 0);
      const gastosTramo = gastos.filter((g) => dentroDeTramo(g.creadoEn, tramo)).reduce((s, g) => s + g.monto, 0);
      const costoVendido = pedidosValidos.filter((p) => dentroDeTramo(fechaOperativa(p), tramo)).reduce((s, p) => s + p.lineas.reduce((c, l) => c + (l.costoUnitario ?? 0) * l.cantidad, 0), 0);
      return {
        etiqueta: tramo.etiqueta,
        ventas,
        egresos: compras + gastosTramo,
        rentabilidad: ventas - costoVendido - gastosTramo,
      };
    });
  }

  const serieBarras = usaApi ? serieTablero(remotoBarras.data, tramosBarras) : serieDe(tramosBarras);
  const serieLinea = usaApi ? serieTablero(remotoLinea.data, tramosLinea) : serieDe(tramosLinea);
  const puntosRentabilidad = serieLinea.map((punto) => ({ etiqueta: punto.etiqueta, valor: punto.rentabilidad }));
  const totalVentasBarras = serieBarras.reduce((s, punto) => s + punto.ventas, 0);
  const totalEgresosBarras = serieBarras.reduce((s, punto) => s + punto.egresos, 0);
  const rentabilidadPeriodo = serieLinea.reduce((s, punto) => s + punto.rentabilidad, 0);

  // En cero no mostramos tarjetas ni gráficas con $0: el negocio se ve "recién instalado".
  const tieneKpis = ventasHoy > 0 || gastosHoy > 0 || comprasHoy > 0 || cantidadHoy > 0 || pendientes > 0 || alertasStock > 0;
  const tieneHoyAyer = ventasHoy > 0 || ventasAyer > 0 || cantidadHoy > 0 || cantidadAyer > 0;
  const tieneGraficaBarras = totalVentasBarras > 0 || totalEgresosBarras > 0;
  const tieneGraficaLinea = puntosRentabilidad.some((punto) => punto.valor !== 0);

  const pedidosPeriodo = pedidosValidos.filter((p) => dentroDePeriodo(fechaOperativa(p), periodoTops, hoy));
  const topProductos = usaApi ? remotoTops.data?.topProductos ?? [] : topProductosDe(pedidosPeriodo, inventario);
  const topClientes = usaApi ? (remotoTops.data?.topClientes ?? []).map((fila) => ({ ...fila, cliente: { nombre: fila.nombre } })) : topClientesDe(pedidosPeriodo, inventario).map((fila) => ({ ...fila, cliente: obtenerCliente(fila.clienteId) }));

  if (usaApi) {
    const consultas = [remotoHoy, remotoMes, remotoAyer, remotoBarras, remotoLinea, remotoTops, remotoDescuadres];
    const error = consultas.find((c) => c.error)?.error;
    if (consultas.some((c) => !c.data)) return <div className="p-4"><p role={error ? "alert" : "status"}>{error?.message ?? "Cargando tablero…"}</p>{error && <button className="mt-3 min-h-11 rounded-xl border border-line px-4" onClick={() => { consultas.forEach((c) => { void c.refetch(); }); }}>Reintentar</button>}</div>;
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {usaApi && [remotoHoy, remotoMes, remotoAyer, remotoBarras, remotoLinea, remotoTops, remotoDescuadres].some((c) => c.error) && <p role="alert" className="shrink-0 rounded-xl bg-danger-soft p-3 text-sm text-danger">No se pudo actualizar el tablero. Se muestra la última lectura. <button type="button" onClick={() => [remotoHoy, remotoMes, remotoAyer, remotoBarras, remotoLinea, remotoTops, remotoDescuadres].forEach((c) => { void c.refetch(); })}>Reintentar</button></p>}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Inicio</h2>
          <GuiaAyuda
            pantalla="Inicio"
            pasos={[
              { titulo: "1 · KPIs del día", texto: "Ventas, gastos, compras, ticket promedio, crédito pendiente y alertas de stock de hoy." },
              { titulo: "Resumen del mes", texto: "Acumulados desde el primer día del mes hasta hoy. El ticket promedio divide las ventas entre los pedidos no cancelados; compras y gastos muestra la suma de ambos." },
              { titulo: "2 · Gráficas con filtro", texto: "Ventas contra compras y gastos, y la rentabilidad que queda. Cambia el filtro a día, semana, mes o año: el eje X siempre es el tiempo." },
              { titulo: "3 · Tops con ganancia", texto: "Los 5 productos y clientes que más mueven el negocio, con lo vendido y la ganancia real (costo conocido). Filtra por día, semana, mes, año o todo." },
            ]}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-2 space-y-4">
      {/* KPIs del día: solo cuando el negocio ya tiene actividad */}
      {tieneKpis ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:max-w-3xl lg:grid-cols-3">
          <TarjetaMetrica etiqueta="Ventas hoy" valor={formatoMoneda(ventasHoy)} tono="teal" />
          <TarjetaMetrica etiqueta="Gastos hoy" valor={formatoMoneda(gastosHoy)} tono="danger" />
          <TarjetaMetrica etiqueta="Compras hoy" valor={formatoMoneda(comprasHoy)} tono="accent" />
          <TarjetaMetrica etiqueta="Ticket promedio" valor={formatoMoneda(ticketPromedio)} tono="ink" />
          <TarjetaMetrica etiqueta="Pendiente crédito" valor={formatoMoneda(pendientes)} tono="danger" />
          <TarjetaMetrica etiqueta="Alertas stock" valor={String(alertasStock)} tono="accent" />
        </div>
      ) : (
        <div className="mt-4 max-w-3xl rounded-xl border border-dashed border-line bg-paper-raised p-4">
          <p className="text-[13px] font-medium text-ink">Aún no hay actividad registrada.</p>
          <p className="mt-1 text-[12px] text-ink-soft">Cuando registres ventas, compras, gastos o créditos, verás los indicadores aquí.</p>
        </div>
      )}

      <section className="max-w-3xl" aria-label="Resumen del mes">
        <h3 className="text-[13px] font-semibold text-ink">Este mes · {hoy.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" })}</h3>
        <p className="mt-1 text-[11px] text-ink-soft">Del primer día del mes hasta hoy</p>
        <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <TarjetaMetrica etiqueta="Ventas del mes" valor={formatoMoneda(ventasMes)} tono="teal" />
          <TarjetaMetrica etiqueta="Gastos del mes" valor={formatoMoneda(gastosMes)} tono="danger" />
          <TarjetaMetrica etiqueta="Compras del mes" valor={formatoMoneda(comprasMes)} tono="accent" />
          <TarjetaMetrica etiqueta="Compras y gastos del mes" valor={formatoMoneda(comprasMes + gastosMes)} tono="danger" />
          <TarjetaMetrica etiqueta="Ticket promedio del mes" valor={formatoMoneda(ticketMes)} tono="ink" />
        </div>
      </section>

      {tieneHoyAyer && (
        <div className="mt-3 max-w-3xl rounded-xl border border-line bg-paper-raised p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Hoy vs ayer</p>
          <p className="mt-1 font-mono text-[15px] font-semibold text-ink">
            {formatoMoneda(ventasHoy)}{" "}
            <span className={`text-[11px] ${variacion >= 0 ? "text-success" : "text-danger"}`}>
              {variacion >= 0 ? "+" : ""}
              {variacion.toFixed(1)}%
            </span>
          </p>
          <p className="text-[11px] text-ink-soft">Ayer {formatoMoneda(ventasAyer)} · {cantidadHoy} pedidos hoy</p>
        </div>
      )}

      {/* Gráfica 1: ventas contra compras y gastos, en la línea de tiempo */}
      {tieneGraficaBarras && (
        <div className="mt-6 max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[14px] font-semibold text-ink">Ventas vs compras y gastos</p>
            <SegmentoControl opciones={GRANULARIDADES} valor={granBarras} onChange={setGranBarras} />
          </div>
          <GraficaBarrasDobles datos={serieBarras} formato={formatoMoneda} />
          {remotoBarras.isPlaceholderData && <p role="status" className="text-xs text-ink-soft">Actualizando periodo; se conserva la gráfica anterior…</p>}
          <p className="mt-2 text-[11px] text-ink-faint">
            Ventas {formatoMoneda(totalVentasBarras)} · compras y gastos {formatoMoneda(totalEgresosBarras)}
          </p>
        </div>
      )}

      {/* Gráfica 2: rentabilidad en el tiempo */}
      {usaApi && <section aria-label="Descuadres de inventario" className="max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-[14px] font-semibold text-ink">Descuadres de inventario</h3>
          <SegmentoControl opciones={GRANULARIDADES} valor={granDescuadres} onChange={setGranDescuadres} />
        </div>
        <p className="mt-1 text-[11px] text-ink-soft">Conteos confirmados y ajustes manuales, valorados al costo guardado. No incluye el inventario inicial.</p>
        <GraficaBarrasDobles datos={serieDescuadres} formato={formatoMoneda} etiquetas={["Sobrantes", "Faltantes"]} />
        {remotoDescuadres.isPlaceholderData && <p role="status" className="text-xs text-ink-soft">Actualizando periodo; se conserva la gráfica anterior…</p>}
        <p className="mt-2 text-[11px] text-ink-soft">Faltantes {formatoMoneda(remotoDescuadres.data?.descuadres.faltantes ?? 0)} · sobrantes {formatoMoneda(remotoDescuadres.data?.descuadres.sobrantes ?? 0)} · neto {formatoMoneda(remotoDescuadres.data?.descuadres.neto ?? 0)}</p>
        {!!remotoDescuadres.data?.descuadres.lineasSinCosto && <p role="status" className="mt-1 text-[11px] text-danger">{remotoDescuadres.data.descuadres.lineasSinCosto} diferencias históricas sin costo guardado; sus importes no están incluidos.</p>}
        <p className="mt-1 text-[11px] text-ink-faint">El neto es sobrantes menos faltantes. Aplicar el ajuste de un conteo no vuelve a sumar su diferencia. No modifica caja ni utilidad.</p>
      </section>}

      {tieneGraficaLinea && (
        <div className="mt-4 max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-display text-[14px] font-semibold text-ink">Rentabilidad</p>
              <p className="text-[11px] text-ink-soft">Ventas menos costo de lo vendido y gastos</p>
            </div>
            <SegmentoControl opciones={GRANULARIDADES} valor={granLinea} onChange={setGranLinea} />
          </div>
          <GraficaLinea datos={puntosRentabilidad} formato={formatoMoneda} />
          {remotoLinea.isPlaceholderData && <p role="status" className="text-xs text-ink-soft">Actualizando periodo; se conserva la gráfica anterior…</p>}
          <p className="mt-2 text-[11px] text-ink-faint">Rentabilidad del periodo {formatoMoneda(rentabilidadPeriodo)}</p>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:max-w-3xl lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[13px] font-semibold text-ink">Top productos</p>
            <SegmentoControl desborda opciones={PERIODOS_TOPS} valor={periodoTops} onChange={setPeriodoTops} />
          </div>
          {topProductos.length === 0 ? (
            <div className="mt-2">
              <ListaVacia compacta titulo="Sin ventas en este periodo." texto="Los productos aparecerán cuando registres pedidos." />
            </div>
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
            <SegmentoControl desborda opciones={PERIODOS_TOPS} valor={periodoTops} onChange={setPeriodoTops} />
          </div>
          {topClientes.length === 0 ? (
            <div className="mt-2">
              <ListaVacia compacta titulo="Sin ventas en este periodo." texto="Los clientes aparecerán cuando registres pedidos." />
            </div>
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

      <div className="mt-6">
        <UtilidadDev />
      </div>
    </div>
    </div>
  );
}
