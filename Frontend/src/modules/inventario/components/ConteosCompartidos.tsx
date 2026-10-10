import { useState } from "react";
import type { LineaCompartidaDTO, CabeceraConteoCompartidoDTO } from "@ambie/contrato";
import { useAuth } from "../../../context/auth";
import { api } from "../../../data/api";
import { usePaginaApi, useRegistroApi } from "../../../data/usePaginaApi";
import { Boton } from "../../../components/Boton";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { Paginacion } from "../../../components/Paginacion";
import { formatoMoneda } from "../../../utils/formato";

type Asignacion = Pick<LineaCompartidaDTO, "productoId" | "nombre" | "codigo" | "unidad" | "asignadoHasta"> & { contadoEnEsperado?: string | null };
const nombreTipo = (tipo: string) => tipo === "aleatorio" ? "Conteo diario" : tipo === "inicial" ? "Inventario inicial" : "Inventario general";

/** El mismo conteo persistido se comparte entre administrador y colaboradores. */
export function ConteosCompartidos({ inicialId }: { inicialId?: string | null }) {
  const { usuario } = useAuth();
  const administrador = usuario?.rol === "administrador";
  const [pagina, setPagina] = useState(1);
  const [paginaLineas, setPaginaLineas] = useState(1);
  const [seleccion, setSeleccion] = useState<string | null>(inicialId ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [asignacion, setAsignacion] = useState<Asignacion | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState<"finalizar" | "aplicar-ajuste" | "cancelar" | null>(null);
  const historial = usePaginaApi<CabeceraConteoCompartidoDTO>(`/inventario/compartidos?page=${pagina}&abiertos=${!administrador}`);
  const lineas = usePaginaApi<LineaCompartidaDTO>(`/inventario/compartidos/${seleccion}/lineas?page=${paginaLineas}&q=${encodeURIComponent(busqueda)}`, !!seleccion);
  const detalle = useRegistroApi<CabeceraConteoCompartidoDTO>(`/inventario/compartidos/${seleccion}`, !!seleccion);
  const conteo = detalle.data ?? historial.items.find(c => c.id === seleccion);
  function refrescar() { window.dispatchEvent(new Event("ambie:datos-actualizados")); }
  async function ejecutar(trabajo: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true); setError(""); setMensaje("");
    try { await trabajo(); refrescar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la operación."); }
    finally { setOcupado(false); }
  }
  async function iniciar(tipo: string) {
    await ejecutar(async () => {
      const creado = await api<{ id: string }>("/inventario/compartidos", "POST", { tipo, turno: "Conteo compartido" });
      setPagina(1); setSeleccion(creado.id); setPaginaLineas(1); setAsignacion(null); setCantidad(""); setBusqueda("");
    });
  }
  async function solicitar(liberar = false) {
    await ejecutar(async () => {
      const recibido = await api<Asignacion | null>(`/inventario/compartidos/${seleccion}/asignar${liberar ? "?liberar=true" : ""}`, "POST", {});
      setAsignacion(recibido); setCantidad("");
      if (!recibido && !liberar) setMensaje("No quedan productos disponibles. Revisa el progreso: otros colaboradores pueden estar contando.");
    });
  }
  async function guardar() {
    const unidades = Number(cantidad);
    if (!asignacion || cantidad.trim() === "" || !Number.isSafeInteger(unidades) || unidades < 0) { setError("Escribe una cantidad entera, incluyendo 0 si no hay unidades."); return; }
    await ejecutar(async () => {
      await api(`/inventario/conteos/${seleccion}/lineas/${asignacion.productoId}?resumen=true`, "PATCH", { stockFisico: unidades, ...("contadoEnEsperado" in asignacion ? { contadoEnEsperado: asignacion.contadoEnEsperado } : {}) });
      setAsignacion(null); setCantidad(""); setMensaje("Cantidad guardada. Puedes tomar el siguiente producto.");
    });
  }
  function abrir(id: string) { setSeleccion(id); setPaginaLineas(1); setAsignacion(null); setCantidad(""); setBusqueda(""); setMensaje(""); setError(""); }
  return <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4" aria-label="Conteos compartidos">
    {administrador && <div className="flex flex-wrap gap-2">
      <Boton ancho="auto" disabled={ocupado || !!asignacion} onClick={() => void iniciar("general")}>Inventario general</Boton>
      <Boton ancho="auto" disabled={ocupado || !!asignacion} onClick={() => void iniciar("aleatorio")}>Conteo diario · 5 productos</Boton>
      <Boton ancho="auto" variante="fantasma" disabled={ocupado || !!asignacion} onClick={() => void iniciar("inicial")}>Inventario inicial</Boton>
    </div>}
    <p className="text-xs text-ink-soft">{administrador ? "Crea usuarios con rol Inventario y comparte este conteo. Solo tú puedes cerrarlo y aplicar las cantidades." : "Abre un conteo iniciado por el administrador y toma un producto disponible."} El conteo diario rota los productos hasta cubrir el catálogo; si hay menos de cinco, incluye todos.</p>
    {(error || historial.error || lineas.error || detalle.error?.message) && <p role="alert" className="text-sm text-danger">{error || historial.error || lineas.error || detalle.error?.message} <button type="button" onClick={() => { historial.actualizar(); lineas.actualizar(); }}>Reintentar lectura</button></p>}
    {mensaje && <p role="status" className="text-sm text-success">{mensaje}</p>}
    {seleccion && <div className="space-y-3 rounded-xl border border-line bg-paper-raised p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{conteo ? nombreTipo(conteo.tipo) : "Detalle del conteo"}</h3><button type="button" disabled={ocupado} onClick={() => { if (asignacion) void ejecutar(async () => { await api(`/inventario/compartidos/${seleccion}/asignar?liberar=true`, "POST", {}); setAsignacion(null); setCantidad(""); setSeleccion(null); }); else setSeleccion(null); }} className="text-sm text-teal">Volver al historial</button></div>
      {conteo && <>
        <p role="status" className="text-sm font-semibold">{conteo.contadas}/{conteo.total} productos contados · {conteo.ocupadas} en conteo · {conteo.colaboradores} colaboradores</p>
        <progress aria-label="Progreso del conteo" value={conteo.contadas} max={Math.max(1, conteo.total)} className="w-full accent-teal" />
        <p className="text-xs text-ink-soft">Inició {new Date(conteo.iniciadoEn).toLocaleString("es-CO")}{conteo.finalizadoEn ? ` · Cerró ${new Date(conteo.finalizadoEn).toLocaleString("es-CO")}` : ""}</p>
        {administrador && <div className="grid grid-cols-2 gap-2 text-xs">
          <p>Unidades contadas: <strong>{conteo.unidades}</strong></p><p>Valor al costo: <strong>{formatoMoneda(conteo.valorContado)}</strong></p>
          <p>Faltantes: <strong>{formatoMoneda(conteo.faltantes)}</strong></p><p>Sobrantes: <strong>{formatoMoneda(conteo.sobrantes)}</strong></p>
          {conteo.sinCosto > 0 && <p className="col-span-2 text-ink-soft">{conteo.sinCosto} registros históricos sin costo guardado; su valoración no se estima.</p>}
        </div>}
      </>}
      {conteo?.estado === "en-curso" && <>
        {asignacion ? <form onSubmit={e => { e.preventDefault(); void guardar(); }} className="space-y-2 rounded-lg bg-teal-soft p-3">
          <p className="font-semibold">{asignacion.nombre}</p><p className="text-xs">{asignacion.codigo} · {asignacion.unidad} · {asignacion.asignadoHasta ? `asignado hasta ${new Date(asignacion.asignadoHasta).toLocaleTimeString("es-CO")}` : "Corrección administrativa"}</p>
          <label className="block text-sm">Cantidad contada<input aria-label="Cantidad contada" type="number" inputMode="numeric" min="0" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-3" /></label>
          <div className="flex flex-wrap gap-2"><Boton type="submit" ancho="auto" disabled={ocupado}>Guardar cantidad</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => { if ("contadoEnEsperado" in asignacion) { setAsignacion(null); setCantidad(""); } else void solicitar(true); }}>{"contadoEnEsperado" in asignacion ? "Cancelar corrección" : "Liberar producto"}</Boton>{!("contadoEnEsperado" in asignacion) && <button type="button" disabled={ocupado} onClick={() => void ejecutar(async () => { const renovada = await api<Asignacion | null>(`/inventario/compartidos/${seleccion}/asignar`, "POST", {}); if (renovada?.productoId === asignacion.productoId) setAsignacion(renovada); else { setAsignacion(renovada); setCantidad(""); setMensaje("La asignación anterior venció; revisa el producto asignado."); } })} className="text-sm text-teal">Renovar tiempo</button>}</div>
        </form> : <Boton ancho="auto" disabled={ocupado} onClick={() => void solicitar()}>Tomar siguiente producto</Boton>}
      </>}
      <BuscadorInput value={busqueda} onChange={v => { setBusqueda(v); setPaginaLineas(1); }} placeholder="Buscar producto del conteo" />
      <Paginacion pagina={paginaLineas} totalPaginas={Math.max(1, Math.ceil(lineas.total / 30))} total={lineas.total} porPagina={30} onChange={setPaginaLineas} />
      <div className="lista-datos min-h-[320px] max-h-[420px] overflow-y-auto space-y-1" inert={lineas.actualizando}>
        {lineas.items.map(l => <article key={l.productoId} className="min-h-16 rounded-lg border border-line p-2 text-xs">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 flex-1 font-semibold text-sm">{l.nombre} <span className="font-normal text-ink-soft">· {l.codigo}</span></p>
          {administrador && conteo?.estado === "en-curso" && l.stockFisico !== null && <button type="button" aria-label={`Corregir cantidad de ${l.nombre}`} disabled={ocupado || !!asignacion} className="shrink-0 min-h-8 text-teal font-semibold" onClick={() => { setAsignacion({ ...l, asignadoHasta: null, contadoEnEsperado: l.contadoEn }); setCantidad(String(l.stockFisico)); setMensaje(""); setError(""); }}>Corregir</button>}
          </div>
          <p className={l.stockFisico !== null ? "text-success" : l.asignadoPor ? "text-teal" : "text-ink-soft"}>{l.stockFisico !== null ? `Contado: ${l.stockFisico} · ${l.contadoPor ?? "Registro anterior"}` : l.asignadoPor ? `En conteo: ${l.asignadoPor}` : "Pendiente · disponible"}</p>
          {l.contadoEn && <p className="text-ink-soft">{new Date(l.contadoEn).toLocaleString("es-CO")}{administrador ? ` · diferencia ${l.diferencia ?? 0}` : ""}</p>}

        </article>)}
        {!lineas.items.length && !lineas.cargando && <p className="p-2 text-sm text-ink-soft">No hay productos con ese filtro.</p>}
      </div>
      {administrador && conteo && <div className="flex flex-wrap gap-2">
        {conteo.estado === "en-curso" && <><Boton ancho="auto" disabled={ocupado || !!asignacion || conteo.contadas !== conteo.total || !!conteo.ocupadas} onClick={() => setConfirmacion("finalizar")}>Finalizar conteo</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado || !!asignacion} onClick={() => setConfirmacion("cancelar")}>Cancelar conteo</Boton></>}
        {conteo.estado === "confirmado" && !conteo.aplicado && <Boton ancho="auto" disabled={ocupado} onClick={() => setConfirmacion("aplicar-ajuste")}>{conteo.tipo === "inicial" ? "Confirmar inventario inicial" : "Aplicar ajuste al stock"}</Boton>}
        {conteo.aplicado && <p className="text-sm text-success">Cantidades aplicadas al inventario.</p>}
      </div>}
      {confirmacion && <div role="dialog" aria-label="Confirmar operación de inventario" className="rounded-lg border border-line p-3 text-sm">
        <p>{confirmacion === "aplicar-ajuste" ? "Se actualizará el stock con las cantidades revisadas. Realiza el conteo durante una pausa de ventas y compras." : confirmacion === "finalizar" ? "Se cerrará el conteo y quedará guardado en el historial. Todavía no cambia el stock." : "Se cancelará este conteo conservando su historial."}</p>
        <div className="mt-2 flex gap-2"><Boton ancho="auto" disabled={ocupado} onClick={() => void ejecutar(async () => { await api(`/inventario/conteos/${seleccion}/${confirmacion}`, "POST", {}); setConfirmacion(null); setMensaje("Operación guardada correctamente."); })}>Confirmar</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => setConfirmacion(null)}>Volver</Boton></div>
      </div>}
    </div>}
    <h3 className="font-semibold">{administrador ? "Historial y progreso de inventarios" : "Conteos disponibles"}</h3>
    <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(historial.total / 30))} total={historial.total} porPagina={30} onChange={setPagina} />
    <div className="lista-datos min-h-[320px] max-h-[420px] overflow-y-auto space-y-1" inert={historial.actualizando}>
      {historial.items.map(c => <button type="button" key={c.id} disabled={ocupado || !!asignacion} onClick={() => abrir(c.id)} className="block min-h-16 w-full rounded-lg border border-line bg-paper-raised p-2 text-left text-xs">
        <p className="text-sm font-semibold">{nombreTipo(c.tipo)} · {c.estado.replace("-", " ")}</p>
        <p>{new Date(c.iniciadoEn).toLocaleString("es-CO")} · {c.contadas}/{c.total} contados · {c.colaboradores} colaboradores</p>
        {administrador && <p>Faltantes {formatoMoneda(c.faltantes)} · sobrantes {formatoMoneda(c.sobrantes)}</p>}
      </button>)}
      {!historial.items.length && !historial.cargando && <p className="p-3 text-sm text-ink-soft">Todavía no hay conteos disponibles.</p>}
    </div>
    {administrador && <p className="text-xs text-ink-soft">Las diferencias se detectan al guardar cada cantidad; la fecha de cierre determina el período del resumen en Inicio. Su valor al costo no equivale a utilidad o pérdida de caja. Compara también ventas, compras y gastos.</p>}
  </section>;
}
