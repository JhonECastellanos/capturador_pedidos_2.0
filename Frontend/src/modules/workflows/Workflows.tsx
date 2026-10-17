import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, respuestaRed } from "../../data/api";
import { claveConsulta, consultas } from "../../data/query";
import { useAuth } from "../../context/auth";
import { Boton } from "../../components/Boton";
import { EditorWorkflow } from "./EditorWorkflow";
import { GrafoSecuencial } from "./GrafoSecuencial";
import { EjecucionVisual } from "./EjecucionVisual";
import { puedeEjecutarFlujo, textoEstado, uuidWorkflow as uuid, type Flujo, type Paso } from "./grafo-modelo";
import { ConocimientoWorkflow } from "./ConocimientoWorkflow";
import { useModulosWorkflow } from "./useModulosWorkflow";

type Config = { version: number; plan: string; creditosMensuales: number; multiplicador: number; modalidad: "propia" | "creditos" | "local"; proveedorId: string; modelo: string; limiteTokens: number; diagnosticoAutorizado: boolean };
type Ejecucion = { id: string; flujo: string; estado: string; creado: string; anterior?: string; pasos?: Paso[] };
type Resumen = { configuracion: Config; creditos: { periodo: string; cupo: number; disponibles: number; consumidosOReservados: number }; flujos: Flujo[]; ejecuciones: Ejecucion[] };
type Plan = { nombre: string; precio?: number; creditosMensuales?: number; usuarios?: number; agentes?: number };
type Oferta = { version: number; planes: Plan[] };
const campo = "w-full rounded-xl border border-line bg-white p-2 text-sm text-ink";
const caja = "rounded-xl border border-line bg-white p-3 sm:p-4";
function useLectura<T>(ruta: string, activo = true, intervalo: number | false = false) {
  return useQuery({ queryKey: claveConsulta(ruta), queryFn: async ({ signal }) => (await respuestaRed<{ data: T }>(ruta, "GET", undefined, signal)).data, enabled: activo, refetchInterval: intervalo });
}

export default function Workflows({ operador = false, integrado = false, vistaInicial = "flujos", empresaInicial = "" }: { operador?: boolean; integrado?: boolean; vistaInicial?: "flujos" | "planes"; empresaInicial?: string }) {
  const { usuario, cerrarSesion } = useAuth();
  const { pathname } = useLocation();
  const sistema = operador && !!usuario?.esSistema && (pathname === "/operador" || pathname.startsWith("/operador/"));
  const administrador = sistema && usuario?.rol === "administrador";
  const [empresaElegida, setEmpresa] = useState(empresaInicial);
  const [vista, setVista] = useState<"flujos" | "planes">(vistaInicial);
  const [ejecucion, setEjecucion] = useState("");
  const [guardado, setGuardado] = useState("");
  const [ocupado, setOcupado] = useState(false), [aviso, setAviso] = useState("");
  const [edicion, setEdicion] = useState<Flujo | null>(null), [config, setConfig] = useState<Config | null>(null);
  const [precios, setPrecios] = useState<Oferta | null>(null);
  const empresas = useLectura<Array<{ id: string; nombre: string; propia: boolean }>>("/workflows/empresas", sistema && vista === "flujos");
  const empresa = empresaElegida || empresas.data?.[0]?.id || "";
  const empresaActual = empresas.data?.find(e => e.id === empresa);
  const lecturaModulos = useModulosWorkflow(empresa, !!empresaActual?.propia, sistema && vista === "flujos" && !!empresaActual);
  // Workflows internos del operador no son una licencia comercial.
  const modulos = { ...lecturaModulos, modulos: [...lecturaModulos.modulos.filter(m => m.id !== "workflows"), ...(sistema ? [{ id: "workflows", nombre: "Workflow interno", habilitado: true }] : [])] };
  const raiz = `/workflows/empresas/${empresa}`;
  const resumen = useLectura<Resumen>(`${raiz}/resumen`, sistema && !!empresa && vista === "flujos", 3000);
  const detalle = useLectura<Ejecucion>(`${raiz}/ejecuciones/${ejecucion}`, sistema && !!empresa && !!ejecucion && vista === "flujos", 2000);
  const oferta = useLectura<Oferta>("/comercial/planes", sistema);
  const conexiones = useLectura<{ proveedores: Array<{ id: string; nombre: string; modelo: string }> }>("/agentes/configuracion", sistema && vista === "flujos" && (empresa === "comercial" || !!empresas.data?.find(e => e.id === empresa)?.propia));
  if (!sistema) return <Navigate to="/admin/configuracion" replace />;
  if (!administrador) return <p role="alert" className={caja}>Solo un administrador puede gestionar workflows.</p>;


  async function hacer(accion: () => Promise<unknown>) {
    if (ocupado) return;
    setOcupado(true); setAviso(""); setGuardado("");
    try { await accion(); await consultas.invalidateQueries({ queryKey: claveConsulta(`${raiz}/resumen`) }); if (ejecucion) await consultas.invalidateQueries({ queryKey: claveConsulta(`${raiz}/ejecuciones/${ejecucion}`) }); }
    catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo completar la acción"); }
    finally { setOcupado(false); }
  }
  function flujoHabilitado(f: Flujo) {
    if (sistema && (f.modulo ?? "workflows") === "workflows") return (f.estado ?? "publicado") === "publicado";
    return puedeEjecutarFlujo(f, modulos.modulos);
  }
  async function nueva(flujo: string) { if (!resumen.data?.flujos.some(f => f.id === flujo && flujoHabilitado(f))) return; const r = await api<Ejecucion>(`${raiz}/ejecuciones`, "POST", { flujo, id: uuid() }); setEjecucion(r.id); }
  async function controlar(accion: string) { const r = await api<Ejecucion>(`${raiz}/ejecuciones/${ejecucion}/${accion}`, "POST", {}); setEjecucion(r.id); await consultas.invalidateQueries({ queryKey: claveConsulta(`${raiz}/ejecuciones/${r.id}`) }); }
  const puedeDiagnosticar = sistema || !!usuario?.esSistema || !!empresas.data?.find(e => e.id === empresa)?.propia || !!resumen.data?.configuracion.diagnosticoAutorizado;
  function accionDisponible(accion: string) {
    const datos = detalle.data;
    if (!datos) return false;
    if (["paso", "ejecutar", "reiniciar"].includes(accion) && !resumen.data?.flujos.some(f => f.id === datos.flujo && flujoHabilitado(f))) return false;
    if (["paso", "ejecutar", "reiniciar"].includes(accion) && !puedeDiagnosticar && datos.pasos?.some(p => p.nodo.tipo === "agente")) return false;
    const trabajando = datos.estado === "ejecutando" || !!datos.pasos?.some(p => p.estado === "ejecutando");
    const finalizada = ["completada", "cancelada", "error", "interrumpida"].includes(datos.estado);
    if (accion === "reiniciar") return !trabajando;
    if (accion === "cancelar" || accion === "pausar") return !finalizada;
    return datos.estado === "pausada" && !trabajando && !!datos.pasos?.some(p => p.estado === "pendiente");
  }
  const fallo = aviso || empresas.error?.message || resumen.error?.message || detalle.error?.message || conexiones.error?.message || modulos.error?.message;
  const contenido = <div className="space-y-4 p-2 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="font-display text-xl font-semibold">{sistema ? "Panel de mando" : "Workflows de mi empresa"}</h1><p className="text-xs text-ink-soft">Flujos en Python · ejecución y consumo separados por empresa</p></div>{sistema && <div className="flex gap-2"><Boton ancho="auto" variante="fantasma" onClick={() => setVista("flujos")}>Workflows</Boton><Boton ancho="auto" variante="fantasma" onClick={() => setVista("planes")}>Planes y créditos</Boton></div>}</div>
    {fallo && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{fallo}</p>}
    {guardado && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success">{guardado}</p>}
    {vista === "planes" && sistema ? <section className={caja}>
      <h2 className="font-semibold">Oferta comercial</h2><p className="my-2 text-sm text-ink-soft">Estos precios y créditos se publican en la landing. La promoción anual mantiene el 50 % y dos meses adicionales. No cambia usuarios ni agentes, ni cobra tarjetas.</p>
      {oferta.error && <p role="alert">{oferta.error.message}</p>}
      {!precios ? <><div className="grid gap-3 md:grid-cols-3">{oferta.data?.planes.filter(p => p.precio !== undefined).map(p => <article key={p.nombre} className={caja}><h3 className="font-semibold">{p.nombre}</h3><p>${p.precio?.toLocaleString("es-CO")} / mes</p><p>{p.creditosMensuales?.toLocaleString("es-CO")} créditos / mes</p><p className="text-xs text-ink-soft">{p.usuarios} usuarios · {p.agentes} agentes</p></article>)}</div><Boton className="mt-3" disabled={!oferta.data} onClick={() => setPrecios(structuredClone(oferta.data!))}>Editar precios y créditos</Boton></> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); void hacer(async () => { await api("/comercial/planes", "PUT", { version: precios.version, planes: precios.planes.filter(p => p.precio !== undefined).map(({ nombre, precio, creditosMensuales }) => ({ nombre, precio, creditosMensuales })) }); setPrecios(null); await consultas.invalidateQueries({ queryKey: claveConsulta("/comercial/planes") }); setAviso("Oferta actualizada. La landing leerá estos valores al abrirse."); }); }}>
        {precios.planes.filter(p => p.precio !== undefined).map(p => <fieldset key={p.nombre} className={caja}><legend className="font-semibold">{p.nombre}</legend><div className="grid grid-cols-2 gap-3"><label className="text-sm">Precio mensual COP<input aria-label={`Precio ${p.nombre}`} type="number" required min="1000" step="1" className={campo} value={p.precio} onChange={e => setPrecios({ ...precios, planes: precios.planes.map(v => v.nombre === p.nombre ? { ...v, precio: Number(e.target.value) } : v) })} /></label><label className="text-sm">Créditos mensuales<input aria-label={`Créditos ${p.nombre}`} type="number" required min="0" step="1" className={campo} value={p.creditosMensuales ?? 0} onChange={e => setPrecios({ ...precios, planes: precios.planes.map(v => v.nombre === p.nombre ? { ...v, creditosMensuales: Number(e.target.value) } : v) })} /></label></div></fieldset>)}
        <div className="flex gap-2"><Boton type="submit" disabled={ocupado}>Guardar oferta</Boton><Boton variante="fantasma" onClick={() => setPrecios(null)}>Cancelar</Boton></div>
      </form>}
    </section> : <>
      <label className="block text-sm">Empresa<select aria-label="Empresa del workflow" className={campo} value={empresa} disabled={ocupado} onChange={e => { setEmpresa(e.target.value); setEjecucion(""); setConfig(null); setEdicion(null); }}>{empresas.data?.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
      {!!empresaActual && <ConocimientoWorkflow key={empresa} empresa={empresa} modulos={modulos.modulos} modulosCargando={modulos.isPending} errorModulos={modulos.error?.message} />}
      {resumen.data && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><article className={caja}><p className="text-xs text-ink-soft">Créditos disponibles</p><strong>{resumen.data.creditos.disponibles.toLocaleString("es-CO")}</strong></article><article className={caja}><p className="text-xs text-ink-soft">Consumidos o reservados</p><strong>{resumen.data.creditos.consumidosOReservados.toLocaleString("es-CO")}</strong></article><article className={caja}><p className="text-xs text-ink-soft">Conexión</p><strong>{resumen.data.configuracion.modalidad === "propia" ? "API propia" : resumen.data.configuracion.modalidad === "local" ? "Local" : "Créditos de IA"}</strong><p className="text-xs">{resumen.data.creditos.periodo}</p></article></div>
        <div className="flex flex-wrap gap-2"><Boton variante="fantasma" ancho="auto" onClick={() => setConfig(structuredClone(resumen.data.configuracion))}>Configurar conexión y cupo</Boton>{empresa !== "comercial" && <Boton variante="fantasma" ancho="auto" disabled={ocupado || !modulos.modulos.some(m => m.habilitado)} onClick={() => setEdicion({ id: uuid(), nombre: "Nuevo flujo", ambito: "empresa", estado: "borrador", modulo: modulos.modulos.find(m => m.id === "workflows" && m.habilitado)?.id ?? modulos.modulos.find(m => m.habilitado)?.id ?? "workflows", version: 0, nodos: [{ tipo: "revision", nombre: "Revisar antes de continuar" }] })}>Crear workflow</Boton>}</div>
        {config && <form className={`${caja} space-y-3`} onSubmit={e => { e.preventDefault(); void hacer(async () => { await api(`${raiz}/configuracion`, "PUT", config); setConfig(null); }); }}>
          <h2 className="font-semibold">Conexión de esta empresa</h2><p className="text-xs text-ink-soft">API propia reutiliza Configuración &gt; Agentes IA. Local necesita un modelo instalado por el cliente. Los créditos requieren una conexión incluida asignada por el operador; las claves no se muestran aquí.</p>
          <div className="grid gap-3 sm:grid-cols-2"><label>Modalidad<select className={campo} value={config.modalidad} onChange={e => setConfig({ ...config, modalidad: e.target.value as Config["modalidad"] })}><option value="propia">API propia</option><option value="creditos">Créditos incluidos</option><option value="local">Modelo local</option></select></label><label>Conexión<select className={campo} value={config.proveedorId} onChange={e => setConfig({ ...config, proveedorId: e.target.value })}><option value="">Heredar la configuración de Agentes IA</option>{conexiones.data?.proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><label>Modelo del nodo<input className={campo} placeholder="Vacío: usar el configurado" value={config.modelo} onChange={e => setConfig({ ...config, modelo: e.target.value })} /></label><label>Máximo de tokens de respuesta<input className={campo} type="number" min="64" max="4096" required value={config.limiteTokens} onChange={e => setConfig({ ...config, limiteTokens: Number(e.target.value) })} /></label>{sistema && <><p className="text-sm">Plan contratado: <strong>{empresa === "comercial" ? "Comercial" : modulos.data?.plan ?? "Cargando…"}</strong><span className="block text-xs text-ink-soft">Se administra en Módulos y accesos.</span></p><label>Cupo mensual<input className={campo} type="number" required min="0" value={config.creditosMensuales} onChange={e => setConfig({ ...config, creditosMensuales: Number(e.target.value) })} /></label><label>Ponderación del modelo<input className={campo} type="number" required min="1" max="1000" value={config.multiplicador} onChange={e => setConfig({ ...config, multiplicador: Number(e.target.value) })} /></label></>}</div>
          {(!sistema || empresas.data?.find(e => e.id === empresa)?.propia) && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={config.diagnosticoAutorizado} onChange={e => setConfig({ ...config, diagnosticoAutorizado: e.target.checked })} />Autorizar al operador a revisar resultados del workflow para diagnóstico. Esto no da acceso directo a la base de datos.</label>}
          <p className="text-xs text-ink-soft">Un crédito base corresponde a 1.000 tokens, ponderado según el modelo. Se reserva antes de consultar y se concilia con el uso reportado. La API propia y el modo local no descuentan este cupo.</p>
          <div className="flex gap-2"><Boton type="submit" disabled={ocupado}>Guardar configuración</Boton><Boton variante="fantasma" onClick={() => setConfig(null)}>Cancelar</Boton></div>
        </form>}
        {edicion && !edicion.privado && <EditorWorkflow key={empresa + ":" + edicion.id} flujo={edicion} conexiones={conexiones.data?.proveedores ?? []} modulos={modulos.modulos} ocupado={ocupado} onChange={setEdicion} onCancelar={() => setEdicion(null)} onGuardar={() => void hacer(async () => {
          const { id, nombre, ambito, version, nodos } = edicion;
          const modulo = edicion.modulo ?? "workflows";
          if (!modulos.modulos.some(m => m.id === modulo && m.habilitado)) throw new Error("El módulo del workflow no está habilitado.");
          await api(raiz + "/flujos/" + id, "PUT", { nombre, ambito, version, nodos, modulo, estado: edicion.estado ?? "publicado" });
          setEdicion(null); setGuardado(`Workflow guardado · ${{ borrador: "Borrador", publicado: "Publicado", deshabilitado: "Deshabilitado" }[edicion.estado ?? "publicado"]}.`);
        })} />}
        <div className="grid gap-3 md:grid-cols-3">{resumen.data.flujos.map(f => <article key={f.id} className={caja}><p className="text-xs text-ink-soft">{f.ambito} · {modulos.modulos.find(m => m.id === (f.modulo ?? "workflows"))?.nombre ?? f.modulo ?? "workflows"} · {({ borrador: "Borrador", publicado: "Publicado", deshabilitado: "Deshabilitado" })[f.estado ?? "publicado"]} · {flujoHabilitado(f) ? "Habilitado" : "No habilitado"}</p><h2 className="font-semibold">{f.nombre}</h2><GrafoSecuencial nodos={f.nodos} compacto />{f.privado && <p className="mb-2 text-xs text-ink-soft">Contenido privado. La empresa debe autorizar su edición.</p>}<div className="flex gap-2"><Boton disabled={ocupado || !flujoHabilitado(f) || (!puedeDiagnosticar && f.nodos.some(n => n.tipo === "agente"))} onClick={() => void hacer(() => nueva(f.id))}>Iniciar</Boton><Boton variante="fantasma" disabled={ocupado || !!f.privado} onClick={() => setEdicion(structuredClone(f))}>Editar</Boton></div></article>)}</div>
        {ejecucion && detalle.data && <section className={`${caja} space-y-3`} aria-label="Detalle de ejecución"><div className="flex items-center justify-between"><h2 className="font-semibold">Ejecución · {textoEstado(detalle.data.estado)}</h2><button type="button" className="min-h-11 min-w-11 rounded-xl border border-line text-xl" aria-label="Cerrar detalle" onClick={() => setEjecucion("")}>×</button></div><EjecucionVisual key={detalle.data.id} pasos={detalle.data.pasos ?? []} estado={detalle.data.estado} /><div className="flex flex-wrap gap-2">{["paso", "ejecutar", "pausar", "cancelar", "reiniciar"].map(a => <Boton ancho="auto" variante="fantasma" disabled={ocupado || !accionDisponible(a)} key={a} onClick={() => void hacer(() => controlar(a))}>{({ paso: "Siguiente paso", ejecutar: "Ejecutar", pausar: "Pausar", cancelar: "Cancelar", reiniciar: "Reiniciar" })[a]}</Boton>)}</div>{!puedeDiagnosticar && detalle.data.pasos?.some(p => p.nodo.tipo === "agente") && <p className="text-xs text-ink-soft">La empresa debe autorizar el diagnóstico antes de ejecutar sus nodos de IA.</p>}<p className="text-xs text-ink-soft">Los pasos de revisión esperan tu intervención. Este motor no confirma ventas ni envía mensajes externos por sí solo.</p></section>}
        <section className={caja}><h2 className="mb-2 font-semibold">Ejecuciones recientes</h2><div className="space-y-2">{resumen.data.ejecuciones.map(e => <button className="flex w-full items-center justify-between gap-2 rounded-xl border border-line p-3 text-left text-sm" key={e.id} onClick={() => setEjecucion(e.id)}><span>{resumen.data.flujos.find(f => f.id === e.flujo)?.nombre ?? e.flujo}<small className="block text-ink-soft">{new Date(e.creado).toLocaleString("es-CO")}</small></span><span>{textoEstado(e.estado)} →</span></button>)}</div></section>
      </>}
    </>}
  </div>;
  return operador && !integrado ? <main className="h-full min-h-0 overflow-y-auto bg-paper text-ink"><header className="flex items-center justify-between border-b border-line bg-white p-3"><a href="/operador" className="font-display font-semibold">ABINOVA · Operador</a><button onClick={() => void cerrarSesion()}>Salir</button></header><div className="mx-auto max-w-6xl">{contenido}</div></main> : contenido;
}
