import { useEffect, useMemo, useState } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { FichaProductoCodigo } from "../../../components/FichaProductoCodigo";
import { BotonEscaner } from "../../../components/BotonEscaner";
import { EscanerCodigo } from "../../../components/EscanerCodigo";
import { CodigosProducto } from "../components/CodigosProducto";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { PantallaCompletaAdmin } from "../../../components/PantallaCompletaAdmin";
import { useTamanoPagina, paginar } from "../../../utils/paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/operaciones";
import { calcularMargen } from "../../../dominio/servicios";
import { formatoMoneda } from "../../../utils/formato";
import type { Producto, CambioPrecio } from "../../../types";
import { api, usaApi } from "../../../data/api";
import { usePaginaApi, useRegistroApi } from "../../../data/usePaginaApi";
import { IntercambioProductosCSV } from "../components/IntercambioProductosCSV";
import { useOperacionAgente } from "../../agentes/operacion-agente";

/** Paso 1: nuevo precio · Paso 2: confirmar */
type Paso = 1 | 2;

export function PreciosAdmin() {
  const POR_PAGINA = useTamanoPagina();
  const { inventario, cambiosPrecio, actualizarPrecioProducto, nombreUsuario } = useOperaciones();
  const [crear, setCrear] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const remoto = usePaginaApi<Producto>(`/productos?page=${pagina}&pageSize=${POR_PAGINA}&orden=nombre&q=${encodeURIComponent(busqueda)}`);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>(1);
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState<string | null>(null);
  const [minimo, setMinimo] = useState<string | null>(null);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  useEffect(() => { setPagina(1); }, [busqueda]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (usaApi) return remoto.items;
    return inventario
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [busqueda, inventario, remoto.items]);

  const detalleRemoto=useRegistroApi<Producto>(`/productos/${productoId}`,!!productoId);
  const historialRemoto = useRegistroApi<Array<CambioPrecio & { usuario: { nombre: string } }>>(`/productos/${productoId}/precios?limite=3`,!!productoId);
  const producto = productoId ? detalleRemoto.data ?? (usaApi ? remoto.items : inventario).find((p) => p.id === productoId) ?? null : null;

  function abrirProducto(id: string) {
    const p = (usaApi ? remoto.items : inventario).find((x) => x.id === id);
    setCosto(null); setMinimo(null);
    setProductoId(id);
    setPrecio(p ? String(p.precioVenta) : "");
    setPaso(1);
  }

  function cerrarProceso() {
    setCosto(null); setMinimo(null);
    setProductoId(null);
    setPrecio("");
    setPaso(1);
  }

  async function guardarPrecio() {
    if (!producto) return false;
    if (!precio.trim() || (costo !== null && !costo.trim()) || (minimo !== null && !minimo.trim())) { mostrarAviso("Completa precio, costo y stock mínimo, incluyendo 0 cuando corresponda", "info"); return false; }
    const nuevo = Number(precio) || 0;
    if (!Number.isFinite(nuevo) || nuevo < 0 || await actualizarPrecioProducto(producto.id, nuevo, usaApi ? { costoActual: costo === null ? undefined : Number(costo), stockMinimo: minimo === null ? undefined : Number(minimo) } : undefined) === false) return false;
    mostrarAviso(`${producto.nombre} → ${formatoMoneda(nuevo)} guardado`, "exito");
    cerrarProceso();
    return true;
  }

  const confirmarPrecioCompartido = useOperacionAgente("precio", r => {
    setCosto(null); setMinimo(null);
    setProductoId(typeof r.datos.productoId === "string" ? r.datos.productoId : null);
    setPrecio(r.instruccion.precio === undefined ? "" : String(r.instruccion.precio));
    setPaso(2);
  }, guardarPrecio, () => ({ operacion: "precio", producto: producto?.nombre, ...(precio.trim() ? { precio: Number(precio) } : {}) }));

  if (crear !== null) return <PantallaCompletaAdmin><div className="flex-1 overflow-y-auto p-3"><FichaProductoCodigo codigoInicial={crear} onCerrar={() => setCrear(null)} onGuardado={r => { setCrear(null); setProductoId(r.producto.id); setPrecio(String(r.producto.precioVenta)); setPaso(1); mostrarAviso("Producto guardado", "exito"); }} /></div></PantallaCompletaAdmin>;

  // ─── Proceso paso a paso: cambiar precio ───
  if (producto) {
    const nuevo = Number(precio) || 0;
    const margenAntes = calcularMargen(producto.precioVenta, producto.costoActual);
    const margenDespues = calcularMargen(nuevo, costo === null ? producto.costoActual : Number(costo));
    const cambia = nuevo !== producto.precioVenta || !!producto.precioPendiente || (costo !== null && Number(costo) !== producto.costoActual) || (minimo !== null && Number(minimo) !== producto.stockMinimo);
    const validos = precio.trim() !== "" && Number.isFinite(nuevo) && nuevo >= 0 && (costo === null || (costo.trim() !== "" && Number.isFinite(Number(costo)) && Number(costo) >= 0)) && (minimo === null || (minimo.trim() !== "" && Number.isSafeInteger(Number(minimo)) && Number(minimo) >= 0));
    const historial = usaApi ? historialRemoto.data ?? [] : cambiosPrecio.filter((c) => c.productoId === producto.id).slice(0, 3);

    return (
      <PantallaCompletaAdmin>
        <BarraSuperior
          titulo={paso === 1 ? "Nuevo precio" : "Confirmar cambio"}
          subtitulo={`${producto.nombre} · Paso ${paso} de 2`}
          onVolver={() => (paso === 2 ? setPaso(1) : cerrarProceso())}
          paso={{ actual: paso, total: 2 }}
        />

        <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 lg:px-8">
          <div className="max-w-xl">
            {paso === 1 && (
              <>
                <div className="rounded-2xl border border-line bg-paper-raised p-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Producto</p>
                  <p className="mt-0.5 truncate font-display text-[16px] font-semibold text-ink">{producto.nombre}</p>
                  <p className="text-[11.5px] text-ink-soft">{producto.codigoInterno} · {producto.categoria}</p>

                  <div className="ticket-edge -mx-4 my-3.5" />

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Costo actual</p>
                      <p className="font-mono text-[14px] font-semibold text-ink">{formatoMoneda(producto.costoActual)}</p>
                    </div>
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Precio actual</p>
                      <p className="font-mono text-[14px] font-semibold text-ink">{formatoMoneda(producto.precioVenta)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-line bg-paper-raised p-4">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Precio de venta nuevo *</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    autoFocus
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    placeholder="0"
                    className="mt-1.5 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3.5 text-center font-mono text-[26px] font-bold tabular-nums text-ink focus:border-accent focus:outline-none"
                  />

                  {usaApi && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs">Costo actual<input aria-label="Costo actual" type="number" min="0" step="0.01" value={costo ?? producto.costoActual} onChange={e => setCosto(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-2"/></label><label className="text-xs">Stock mínimo<input aria-label="Stock mínimo" type="number" min="0" step="1" value={minimo ?? producto.stockMinimo} onChange={e => setMinimo(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-2"/></label></div>}
                  {cambia && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-paper-sunken px-3 py-2.5 text-[12.5px]">
                      <span className="text-ink-soft">
                        {formatoMoneda(producto.precioVenta)} → <strong className="font-mono text-ink">{formatoMoneda(nuevo)}</strong>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${margenDespues.absoluto >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                        Margen {margenDespues.porcentaje.toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                    Margen actual: {formatoMoneda(margenAntes.absoluto)} ({margenAntes.porcentaje.toFixed(1)}%) contra el último costo.
                  </p>
                </div>

                {usaApi && <CodigosProducto productoId={producto.id} />}
                {producto.precioPendiente && <p className="mt-2 text-xs text-danger">Precio pendiente: confirma el precio para habilitar la venta.</p>}
                {historial.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-line bg-paper-raised p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Cambios recientes</p>
                    <ul className="mt-1.5 space-y-1">
                      {historial.map((cambio) => (
                        <li key={cambio.id} className="text-[11.5px] text-ink-soft">
                          {formatoMoneda(cambio.valorAnterior)} → <strong className="font-mono text-ink">{formatoMoneda(cambio.valorNuevo)}</strong> · {new Date(cambio.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })} · {("usuario" in cambio ? (cambio.usuario as {nombre:string}).nombre : nombreUsuario(cambio.usuarioId))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {paso === 2 && (
              <>
                <div className="rounded-2xl border border-line bg-paper-raised p-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen del cambio</p>
                  <p className="mt-0.5 truncate font-display text-[15.5px] font-semibold text-ink">{producto.nombre}</p>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5">
                      <span className="text-[12.5px] text-ink-soft">Antes</span>
                      <span className="font-mono text-[14px] font-semibold text-ink-soft line-through">{formatoMoneda(producto.precioVenta)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-ink/20 bg-accent-soft px-3.5 py-2.5">
                      <span className="text-[12.5px] font-semibold text-ink">Después</span>
                      <span className="font-mono text-[16px] font-bold text-ink">{formatoMoneda(nuevo)}</span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Margen antes</p>
                      <p className="font-mono text-[13px] font-semibold text-ink-soft">{margenAntes.porcentaje.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Margen después</p>
                      <p className={`font-mono text-[13px] font-bold ${margenDespues.absoluto >= 0 ? "text-success" : "text-danger"}`}>
                        {formatoMoneda(margenDespues.absoluto)} · {margenDespues.porcentaje.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {usaApi && <p className="mt-2 text-xs text-ink-soft">Costo {formatoMoneda(costo === null ? producto.costoActual : Number(costo))} · stock mínimo {minimo ?? producto.stockMinimo}. Las existencias se conservan.</p>}
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                    Queda auditado con valor anterior, nuevo, usuario y fecha.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>

        <BarraInferior>
          {paso === 1 ? (
            <Boton disabled={!cambia || !validos} onClick={() => setPaso(2)}>
              Revisar y confirmar →
            </Boton>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink"
              >
                ← Corregir
              </button>
              <Boton onClick={confirmarPrecioCompartido}>Guardar precio</Boton>
            </div>
          )}
        </BarraInferior>
      </PantallaCompletaAdmin>
    );
  }

  // ─── Lista: elegir producto ───
  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Precios y márgenes</h2>
          <GuiaAyuda
            pantalla="Precios y márgenes"
            pasos={[
              { titulo: "1 · Elegir producto", texto: "Busca por nombre, código o categoría y toca el producto que quieres actualizar." },
              { titulo: "2 · Nuevo precio", texto: "Escribe el precio nuevo y mira el margen en vivo contra el último costo, antes de continuar." },
              { titulo: "3 · Confirmar", texto: "Revisa el antes y el después con su margen y guarda. Queda auditado con usuario y fecha." },
            ]}
          />
        </div>
      </div>

      <div className="flex-shrink-0 pt-2.5">
        {usaApi && <><button type="button" onClick={() => setCrear("")} className="min-h-9 text-xs font-semibold text-teal">Crear producto o vincular código</button><IntercambioProductosCSV /></>}
        <BuscadorInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, código o categoría" accion={usaApi ? <BotonEscaner onClick={() => setCamara(true)} /> : undefined} />
        {camara && <EscanerCodigo onCerrar={() => setCamara(false)} onCodigo={codigo => { setCamara(false); void api<Producto | null>(`/productos/codigo/lectura?codigo=${encodeURIComponent(codigo)}`).then(p => { if (p) { setProductoId(p.id); setPrecio(String(p.precioVenta)); setPaso(1); } else setCrear(codigo); }).catch(e => mostrarAviso(e instanceof Error ? e.message : "No se pudo leer el producto", "info")); }} />}
      </div>

      <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil((usaApi ? remoto.total : filtrados.length) / POR_PAGINA))} total={usaApi ? remoto.total : filtrados.length} porPagina={POR_PAGINA} onChange={setPagina} />

      {/* Lista con scroll propio */}
      <div inert={usaApi && (remoto.actualizando)} className="lista-datos mt-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2.5 rounded-2xl border border-line bg-paper-sunken/30 p-2 sm:p-3">
        {filtrados.length === 0 ? (
          <ListaVacia
            titulo={busqueda ? "No se encontraron productos para esta búsqueda." : "Aún no hay productos."}
            texto={!busqueda ? "Créalos desde Inventario para poder cambiar sus precios." : undefined}
          />
        ) : (
          (usaApi ? filtrados : paginar(filtrados, pagina, POR_PAGINA).items).map((p) => {
            const margen = calcularMargen(p.precioVenta, p.costoActual);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => abrirProducto(p.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5 text-left shadow-sm active:bg-paper-sunken"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{p.nombre}</p>
                  <p className="truncate text-[11.5px] text-ink-soft">{p.codigoInterno} · {p.categoria} · costo {formatoMoneda(p.costoActual)}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${margen.absoluto >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                    Margen {margen.porcentaje.toFixed(1)}%
                  </span>
                </div>
                <span className="flex-shrink-0 text-right">
                  <span className="block font-mono text-[14px] font-bold text-ink">{formatoMoneda(p.precioVenta)}</span>
                  <span className="text-[10.5px] font-semibold text-teal">Editar →</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />


    </div>
  );
}
