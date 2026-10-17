import { useState } from "react";
import type { LineaCompartidaDTO, CabeceraConteoCompartidoDTO, ProductoDTO } from "@abinova/contrato";
import { useAuth } from "../../../context/auth";
import { api } from "../../../data/api";
import { usePaginaApi, useRegistroApi } from "../../../data/usePaginaApi";
import { Boton } from "../../../components/Boton";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { IconX } from "../../../components/Icons";
import { BotonEscaner } from "../../../components/BotonEscaner";
import { LecturaProductoCodigo } from "../../../components/LecturaProductoCodigo";
import { FichaProductoCodigo } from "../../../components/FichaProductoCodigo";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { Paginacion } from "../../../components/Paginacion";
import { useTamanoPagina } from "../../../utils/paginacion";
import { formatoMoneda } from "../../../utils/formato";
import { useOperacionAgente } from "../../agentes/operacion-agente";

type Asignacion = Pick<LineaCompartidaDTO, "productoId" | "nombre" | "codigo" | "unidad" | "asignadoHasta"> & { contadoEnEsperado?: string | null };
const nombreTipo = (tipo: string) => tipo === "aleatorio" ? "Conteo diario" : tipo === "inicial" ? "Inventario inicial" : "Inventario general";

/** El mismo conteo persistido se comparte entre administrador y colaboradores. */
export function ConteosCompartidos({ inicialId }: { inicialId?: string | null }) {
  const { usuario } = useAuth();
  const porPagina = useTamanoPagina();
  const administrador = usuario?.rol === "administrador";
  const [camara, setCamara] = useState(false);
  const [continuo, setContinuo] = useState(false);
  const [ficha, setFicha] = useState<{codigo: string; base?: Pick<ProductoDTO, "id" | "nombre" | "nombreBase" | "categoria">} | null>(null);
  const [productoLeido, setProductoLeido] = useState<{producto: ProductoDTO; codigo: string} | null>(null);
  const [pagina, setPagina] = useState(1);
  const [paginaLineas, setPaginaLineas] = useState(1);
  const [seleccion, setSeleccion] = useState<string | null>(inicialId ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [asignacion, setAsignacion] = useState<Asignacion | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState<"iniciar" | "finalizar" | "aplicar-ajuste" | "cancelar" | "salir" | null>(null);
  const [tipoInicio, setTipoInicio] = useState<string | null>(null);
  const historial = usePaginaApi<CabeceraConteoCompartidoDTO>(`/inventario/compartidos?page=${pagina}&pageSize=${porPagina}&abiertos=${!administrador}`);
  const lineas = usePaginaApi<LineaCompartidaDTO>(`/inventario/compartidos/${seleccion}/lineas?page=${paginaLineas}&pageSize=${porPagina}&q=${encodeURIComponent(busqueda)}`, !!seleccion);
  const detalle = useRegistroApi<CabeceraConteoCompartidoDTO>(`/inventario/compartidos/${seleccion}`, !!seleccion);
  const conteo = detalle.data ?? historial.items.find(c => c.id === seleccion);
  function refrescar() { window.dispatchEvent(new Event("abinova:datos-actualizados")); }
  async function ejecutar(trabajo: () => Promise<void>) {
    if (ocupado) return false;
    setOcupado(true); setError(""); setMensaje("");
    try { await trabajo(); refrescar(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la operación."); return false; }
    finally { setOcupado(false); }
  }
  async function iniciar(tipo: string) {
    return ejecutar(async () => {
      const creado = await api<{ id: string }>("/inventario/compartidos", "POST", { tipo, turno: "Conteo compartido" });
      setPagina(1); setSeleccion(creado.id); setPaginaLineas(1); setAsignacion(null); setCantidad(""); setBusqueda("");
    });
  }
  async function leerCodigo(producto: ProductoDTO | null, codigo: string) {
    setCamara(false);
    await ejecutar(async () => {
      if (!producto) {
        if (conteo?.tipo === "inicial") { setFicha({codigo}); return; }
        throw new Error("Código sin registrar. Pide al administrador que lo vincule al producto en Productos.");
      }
      setProductoLeido({producto, codigo});
      const recibido = await api<Asignacion | null>(`/inventario/compartidos/${seleccion}/asignar`, "POST", { productoId: producto.id });
      setAsignacion(recibido); setCantidad(""); setBusqueda(producto.nombre); setPaginaLineas(1);
    });
  }
  async function crearPresentacion() {
    if (!productoLeido) return;
    await ejecutar(async () => {
      if (asignacion) await api(`/inventario/compartidos/${seleccion}/asignar?liberar=true`, "POST", {});
      const p = productoLeido.producto;
      setAsignacion(null); setCantidad(""); setFicha({codigo: productoLeido.codigo, base: {id: p.productoBaseId ?? p.id, nombre: p.nombreBase ?? p.nombre, nombreBase: p.nombreBase, categoria: p.categoria}});
    });
  }
  async function solicitar(liberar = false) {
    setProductoLeido(null);
    await ejecutar(async () => {
      const recibido = await api<Asignacion | null>(`/inventario/compartidos/${seleccion}/asignar${liberar ? "?liberar=true" : ""}`, "POST", {});
      setAsignacion(recibido); setCantidad("");
      if (!recibido && !liberar) setMensaje("No quedan productos disponibles. Revisa el progreso: otros colaboradores pueden estar contando.");
    });
  }
  async function guardar() {
    const unidades = Number(cantidad);
    if (!asignacion || cantidad.trim() === "" || !Number.isSafeInteger(unidades) || unidades < 0) { setError("Escribe una cantidad entera, incluyendo 0 si no hay unidades."); return false; }
    return ejecutar(async () => {
      await api(`/inventario/conteos/${seleccion}/lineas/${asignacion.productoId}?resumen=true`, "PATCH", { stockFisico: unidades, ...("contadoEnEsperado" in asignacion ? { contadoEnEsperado: asignacion.contadoEnEsperado } : {}) });
      setAsignacion(null); setCantidad(""); setBusqueda("");
      if (continuo && (conteo?.tipo === "inicial" || (conteo?.contadas ?? 0) + 1 < (conteo?.total ?? 0))) { setCamara(true); setMensaje("Cantidad guardada. Escanea el siguiente producto."); }
      else { setContinuo(false); setMensaje("Cantidad guardada. Revisa el progreso del conteo."); }
    });
  }
  const confirmarCantidadCompartida = useOperacionAgente("conteo", r => {
    setSeleccion(r.instruccion.conteoId ?? null);
    setAsignacion((r.datos.asignacion as Asignacion | null) ?? null);
    setCantidad(r.instruccion.cantidad === undefined ? "" : String(r.instruccion.cantidad));
    setMensaje(r.resumen);
  }, guardar, () => ({ operacion: "conteo", ...(seleccion ? { conteoId: seleccion } : {}), producto: asignacion?.nombre, ...(cantidad.trim() ? { cantidad: Number(cantidad) } : {}) }));
  const confirmarInicioCompartido = useOperacionAgente("iniciar-conteo", r => {
    setTipoInicio(r.instruccion.tipoConteo ?? null); setConfirmacion("iniciar"); setMensaje(r.resumen);
  }, async () => {
    if (!administrador || !tipoInicio) return false;
    const resultado = await iniciar(tipoInicio);
    if (resultado) { setConfirmacion(null); setTipoInicio(null); }
    return resultado;
  });
  async function guardarConfirmacion(accion: "finalizar" | "aplicar-ajuste" | "cancelar") {
    if (!administrador || !seleccion) return false;
    return ejecutar(async () => { await api(`/inventario/conteos/${seleccion}/${accion}`, "POST", {}); setConfirmacion(null); if (accion === "cancelar") { setAsignacion(null); setCantidad(""); setContinuo(false); setCamara(false); setFicha(null); setProductoLeido(null); void detalle.refetch(); } setMensaje("Operación guardada correctamente."); });
  }
  async function salirDelConteo() {
    await ejecutar(async () => {
      if (asignacion && !("contadoEnEsperado" in asignacion)) await api(`/inventario/compartidos/${seleccion}/asignar?liberar=true`, "POST", {});
      setAsignacion(null); setCantidad(""); setContinuo(false); setCamara(false); setFicha(null); setProductoLeido(null); setSeleccion(null); setConfirmacion(null);
      setMensaje("Puedes continuar después. Las cantidades guardadas y los demás colaboradores se conservan.");
    });
  }
  const confirmarFinalCompartido = useOperacionAgente("finalizar-conteo", r => {
    setSeleccion(r.instruccion.conteoId ?? null); setConfirmacion("finalizar"); setMensaje(r.resumen);
  }, () => guardarConfirmacion("finalizar"));
  const confirmarAplicacionCompartida = useOperacionAgente("aplicar-conteo", r => {
    setSeleccion(r.instruccion.conteoId ?? null); setConfirmacion("aplicar-ajuste"); setMensaje(r.resumen);
  }, () => guardarConfirmacion("aplicar-ajuste"));
  function abrir(id: string) { setFicha(null); setProductoLeido(null); setContinuo(false); setSeleccion(id); setPaginaLineas(1); setAsignacion(null); setCantidad(""); setBusqueda(""); setMensaje(""); setError(""); }
  return <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4" aria-label="Conteos compartidos">
    {administrador && !seleccion && <div className="flex flex-wrap gap-2">
      <Boton ancho="auto" disabled={ocupado || !!asignacion} onClick={() => void iniciar("general")}>Inventario general</Boton>
      <Boton ancho="auto" disabled={ocupado || !!asignacion} onClick={() => void iniciar("aleatorio")}>Conteo diario · 5 productos</Boton>
    </div>}
    {usuario?.rol === "vendedor" && !seleccion && <Boton ancho="auto" disabled={ocupado} onClick={() => void iniciar("aleatorio")}>Abrir conteo de hoy · 5 productos</Boton>}
    <p className="text-xs text-ink-soft">{administrador ? "Crea usuarios con rol Inventario y comparte este conteo. Solo tú puedes cerrarlo y aplicar las cantidades." : usuario?.rol === "vendedor" ? "Cuenta los cinco productos del día. Las cantidades se comparten con el administrador." : "Abre un inventario inicial o general iniciado por el administrador y toma un producto disponible."} El conteo diario rota los productos hasta cubrir el catálogo; si hay menos de cinco, incluye todos.</p>
    {(error || historial.error || lineas.error || detalle.error?.message) && <p role="alert" className="text-sm text-danger">{error || historial.error || lineas.error || detalle.error?.message} <button type="button" onClick={() => { historial.actualizar(); lineas.actualizar(); }}>Reintentar lectura</button></p>}
    {mensaje && <p role="status" className="text-sm text-success">{mensaje}</p>}
    {seleccion && <div className="space-y-3 rounded-xl border border-line bg-paper-raised p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="min-w-0 font-semibold">{conteo ? nombreTipo(conteo.tipo) : "Detalle del conteo"}</h3><div className="flex shrink-0 items-center gap-1"><button type="button" disabled={ocupado} onClick={() => { if (asignacion || ficha) setConfirmacion("salir"); else { setSeleccion(null); setContinuo(false); } }} className="text-sm text-teal">{administrador ? "← Historial" : "← Conteos"}</button>{conteo?.estado === "en-curso" && <button type="button" aria-label="Salir del conteo y continuar después" title="Salir y continuar después" disabled={ocupado} onClick={() => setConfirmacion("salir")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken"><IconX width={18} height={18} /></button>}</div></div>
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
      {ficha && conteo?.tipo === "inicial" && <FichaProductoCodigo codigoInicial={ficha.codigo} productoBase={ficha.base} conteoId={seleccion ?? undefined} onCerrar={() => setFicha(null)} onGuardado={r => { setFicha(null); setAsignacion(null); setCantidad(""); setProductoLeido(null); setMensaje(r.yaContado ? "Etiqueta vinculada. La cantidad anterior se conserva; continúa con otro producto." : "Producto y cantidad inicial guardados. Continúa con el siguiente."); refrescar(); if (continuo) setCamara(true); }} />}
      {conteo?.estado === "en-curso" && !ficha && <>
        {asignacion ? <form onSubmit={e => { e.preventDefault(); void confirmarCantidadCompartida(); }} className="space-y-2 rounded-lg bg-teal-soft p-3">
          <p className="font-semibold">{asignacion.nombre}</p><p className="text-xs">{asignacion.codigo} · {asignacion.unidad} · {asignacion.asignadoHasta ? `asignado hasta ${new Date(asignacion.asignadoHasta).toLocaleTimeString("es-CO")}` : "Corrección administrativa"}</p>
          <label className="block text-sm">Cantidad contada<input autoFocus aria-label="Cantidad contada" type="number" inputMode="numeric" min="0" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-3" /></label>
          <div className="flex flex-wrap gap-2"><Boton type="submit" ancho="auto" disabled={ocupado}>Guardar cantidad</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => { if ("contadoEnEsperado" in asignacion) { setAsignacion(null); setCantidad(""); } else void solicitar(true); }}>{"contadoEnEsperado" in asignacion ? "Cancelar corrección" : "Liberar producto"}</Boton>{!("contadoEnEsperado" in asignacion) && <button type="button" disabled={ocupado} onClick={() => void ejecutar(async () => { const renovada = await api<Asignacion | null>(`/inventario/compartidos/${seleccion}/asignar`, "POST", {}); if (renovada?.productoId === asignacion.productoId) setAsignacion(renovada); else { setAsignacion(renovada); setCantidad(""); setMensaje("La asignación anterior venció; revisa el producto asignado."); } })} className="text-sm text-teal">Renovar tiempo</button>}</div>
        </form> : <div className="flex flex-wrap gap-2"><Boton ancho="auto" disabled={ocupado} onClick={() => { setContinuo(false); void solicitar(); }}>Tomar siguiente producto</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => { setContinuo(true); setCamara(true); }}>Contar con cámara</Boton>{conteo.tipo === "inicial" && <Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => { setContinuo(false); setFicha({codigo:""}); }}>Crear o buscar producto</Boton>}</div>}
        {conteo?.tipo === "inicial" && productoLeido && <button type="button" disabled={ocupado} onClick={() => { void crearPresentacion(); }} className="min-h-10 text-xs text-teal underline">Crear otra presentación con esta etiqueta</button>}
        {continuo && <p className="text-xs text-teal">Modo escáner: guardar cantidad abre la cámara del siguiente producto. <button type="button" disabled={ocupado} onClick={() => setContinuo(false)} className="min-h-8 underline">Salir del modo escáner</button></p>}
      </>}
      <BuscadorInput value={busqueda} onChange={v => { setBusqueda(v); setPaginaLineas(1); }} placeholder="Buscar producto del conteo" accion={conteo?.estado === "en-curso" && !asignacion && !ficha ? <BotonEscaner disabled={ocupado} onClick={() => { setContinuo(true); setCamara(true); }} /> : undefined} />
      <Paginacion pagina={paginaLineas} totalPaginas={Math.max(1, Math.ceil(lineas.total / porPagina))} total={lineas.total} porPagina={porPagina} onChange={setPaginaLineas} />
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
        {conteo.estado === "en-curso" && <><Boton ancho="auto" disabled={ocupado || !!asignacion || conteo.contadas !== conteo.total || !!conteo.ocupadas} onClick={() => setConfirmacion("finalizar")}>Finalizar conteo</Boton><button type="button" aria-label="Cancelar conteo definitivamente" title="Cancelar conteo definitivamente" disabled={ocupado} onClick={() => setConfirmacion("cancelar")} className="flex h-9 w-9 items-center justify-center rounded-full border border-danger/30 text-danger hover:bg-danger-soft"><IconX width={18} height={18} /></button></>}
        {conteo.estado === "confirmado" && !conteo.aplicado && <Boton ancho="auto" disabled={ocupado} onClick={() => setConfirmacion("aplicar-ajuste")}>{conteo.tipo === "inicial" ? "Confirmar inventario inicial" : "Aplicar ajuste al stock"}</Boton>}
        {conteo.aplicado && <p className="text-sm text-success">Cantidades aplicadas al inventario.</p>}
      </div>}
      {confirmacion && confirmacion !== "iniciar" && confirmacion !== "salir" && confirmacion !== "cancelar" && <div role="dialog" aria-label="Confirmar operación de inventario" className="rounded-lg border border-line p-3 text-sm">
        <p>{confirmacion === "aplicar-ajuste" ? "Se actualizará el stock con las cantidades revisadas. Realiza el conteo durante una pausa de ventas y compras." : confirmacion === "finalizar" ? "Se cerrará el conteo y quedará guardado en el historial. Todavía no cambia el stock." : "Se cancelará este conteo conservando su historial."}</p>
        <div className="mt-2 flex gap-2"><Boton ancho="auto" disabled={ocupado} onClick={() => void (confirmacion === "finalizar" ? confirmarFinalCompartido() : confirmarAplicacionCompartida())}>Confirmar</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => setConfirmacion(null)}>Volver</Boton></div>
      </div>}
    </div>}
    <ConfirmarAccion abierto={confirmacion === "salir"} titulo="Salir del conteo" mensaje="Conservaremos las cantidades guardadas para continuar después. Se libera solo tu producto asignado; lo que aún no has guardado no se registra." textoConfirmar="Continuar después" ocupado={ocupado} alCancelar={() => setConfirmacion(null)} alConfirmar={() => void salirDelConteo()} />
    <ConfirmarAccion abierto={confirmacion === "cancelar"} titulo="Cancelar conteo definitivamente" mensaje="Se cerrará este conteo para todos los colaboradores y se conservará su historial, sin cambiar el stock. Para retomarlo más tarde, vuelve y utiliza la X junto al título." textoConfirmar="Sí, cancelar" tono="peligro" ocupado={ocupado} alCancelar={() => setConfirmacion(null)} alConfirmar={() => void guardarConfirmacion("cancelar")} />
    {administrador && confirmacion === "iniciar" && <div role="dialog" aria-label="Revisar inicio de inventario" className="rounded-lg border border-line bg-paper-raised p-3 text-sm"><p>Crear {nombreTipo(tipoInicio ?? "general")}. El stock solo cambia al aplicar las cantidades revisadas.</p><div className="mt-2 flex gap-2"><Boton ancho="auto" disabled={ocupado} onClick={confirmarInicioCompartido}>Confirmar inicio</Boton><Boton ancho="auto" variante="fantasma" disabled={ocupado} onClick={() => { setConfirmacion(null); setTipoInicio(null); }}>Volver</Boton></div></div>}
    {!seleccion && <>
    <h3 className="font-semibold">{administrador ? "Historial y progreso de inventarios" : "Conteos disponibles"}</h3>
    <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(historial.total / porPagina))} total={historial.total} porPagina={porPagina} onChange={setPagina} />
    <div className="lista-datos min-h-[320px] max-h-[420px] overflow-y-auto space-y-1" inert={historial.actualizando}>
      {historial.items.map(c => <button type="button" key={c.id} disabled={ocupado || !!asignacion} onClick={() => abrir(c.id)} className="block min-h-16 w-full rounded-lg border border-line bg-paper-raised p-2 text-left text-xs">
        <p className="text-sm font-semibold">{nombreTipo(c.tipo)} · {c.estado.replace("-", " ")}</p>
        <p>{new Date(c.iniciadoEn).toLocaleString("es-CO")} · {c.contadas}/{c.total} contados · {c.colaboradores} colaboradores</p>
        {administrador && <p>Faltantes {formatoMoneda(c.faltantes)} · sobrantes {formatoMoneda(c.sobrantes)}</p>}
      </button>)}
      {!historial.items.length && !historial.cargando && <p className="p-3 text-sm text-ink-soft">Todavía no hay conteos disponibles.</p>}
    </div>
    </>}
    {camara && <LecturaProductoCodigo onCerrar={() => setCamara(false)} onProducto={(p, codigo) => { void leerCodigo(p, codigo); }} />}
    {administrador && <p className="text-xs text-ink-soft">Las diferencias se detectan al guardar cada cantidad; la fecha de cierre determina el período del resumen en Inicio. Su valor al costo no equivale a utilidad o pérdida de caja. Compara también ventas, compras y gastos.</p>}
  </section>;
}
