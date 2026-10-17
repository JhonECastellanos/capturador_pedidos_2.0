import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MODULOS_IMPLEMENTADOS, PLANES_COMERCIALES, type AccesoComercial, type AsignacionModulos, type CatalogoModulos } from "@abinova/contrato";
import { api, respuestaRed } from "../../data/api";
import { claveConsulta, consultas } from "../../data/query";
import { Boton } from "../../components/Boton";

const campo = "w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm";
const caja = "space-y-3 rounded-xl border border-line bg-paper-raised p-3 sm:p-4";
type Empresa = { id: string; nombre: string };
type Detalle = { asignacion: AsignacionModulos; acceso: AccesoComercial };
function useControl<T>(ruta: string, activo = true) {
  return useQuery({ queryKey: claveConsulta(ruta), enabled: activo, queryFn: async ({ signal }) => (await respuestaRed<{ data: T }>(ruta, "GET", undefined, signal)).data });
}

export default function ModulosControl({ empresas }: { empresas: Empresa[] }) {
  const [vista, setVista] = useState<"catalogo" | "empresa">("catalogo");
  const [empresa, setEmpresa] = useState(empresas[0]?.id ?? "");
  const [plan, setPlan] = useState<(typeof PLANES_COMERCIALES)[number]>("Esencial");
  const [borrador, setBorrador] = useState<CatalogoModulos | null>(null);
  const [asignacion, setAsignacion] = useState<AsignacionModulos | null>(null);
  const [nuevo, setNuevo] = useState({ id: "", nombre: "" });
  const [ocupado, setOcupado] = useState(false), [aviso, setAviso] = useState("");
  const catalogo = useControl<CatalogoModulos>("/control/modulos");
  const rutaEmpresa = `/control/empresas/${empresa}/asignacion`;
  const detalle = useControl<Detalle>(rutaEmpresa, !!empresa && vista === "empresa");
  const datos = borrador ?? catalogo.data;
  const elegida = asignacion ?? detalle.data?.asignacion;
  async function guardar(accion: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true); setAviso("");
    try { await accion(); await consultas.invalidateQueries({ queryKey: claveConsulta("/licencia") }); setAviso("Configuración guardada. El negocio recibirá los accesos al sincronizar, normalmente en unos segundos."); }
    catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo guardar. Conservamos tus cambios."); }
    finally { setOcupado(false); }
  }
  function agregar(e: FormEvent) {
    e.preventDefault(); if (!datos) return;
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(nuevo.id) || nuevo.nombre.trim().length < 2 || datos.modulos.some(m => m.id === nuevo.id)) { setAviso("Usa un código único en minúsculas, con guiones, y un nombre de al menos dos caracteres."); return; }
    setBorrador({ ...datos, modulos: [...datos.modulos, { id: nuevo.id, nombre: nuevo.nombre.trim() }] }); setNuevo({ id: "", nombre: "" }); setAviso("");
  }
  function quitar(id: string) {
    if (!datos || ["resumen", "configuracion"].includes(id) || !window.confirm("¿Retirar este módulo del catálogo y de los planes? No se borrarán datos ni se desinstalará código.")) return;
    setBorrador({ ...datos, modulos: datos.modulos.filter(m => m.id !== id), planes: Object.fromEntries(PLANES_COMERCIALES.map(p => [p, datos.planes[p].filter(v => v !== id)])) as CatalogoModulos["planes"] });
  }
  return <section className="space-y-4" aria-label="Control de módulos">
    <div><h2 className="text-lg font-semibold">Módulos por plan y empresa</h2><p className="text-sm text-ink-soft">Decide qué incluye cada plan y ajusta excepciones por empresa. Los módulos en desarrollo quedan registrados, sin habilitar pantallas ni operaciones inexistentes. Resumen y Configuración conservan el acceso básico.</p></div>
    <div className="flex gap-2"><Boton ancho="auto" variante={vista === "catalogo" ? "primario" : "fantasma"} onClick={() => setVista("catalogo")}>Catálogo y planes</Boton><Boton ancho="auto" variante={vista === "empresa" ? "primario" : "fantasma"} onClick={() => setVista("empresa")}>Asignar a empresa</Boton></div>
    {(aviso || catalogo.error || detalle.error) && <p role="status" className="rounded-xl border border-line p-3 text-sm">{aviso || catalogo.error?.message || detalle.error?.message}</p>}
    {!datos ? <p role="status">Cargando catálogo…</p> : vista === "catalogo" ? <>
      <form className={caja} onSubmit={agregar}><h3 className="font-semibold">Agregar módulo al catálogo</h3><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><label>Código<input className={campo} aria-label="Código del nuevo módulo" required maxLength={50} placeholder="servicio-tecnico" value={nuevo.id} onChange={e => setNuevo({ ...nuevo, id: e.target.value })} /></label><label>Nombre<input className={campo} aria-label="Nombre del nuevo módulo" required maxLength={70} placeholder="Servicio técnico" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></label><Boton type="submit" ancho="auto" disabled={ocupado || datos.modulos.length >= 100}>Agregar</Boton></div><p className="text-xs text-ink-soft">Agregar prepara el cambio; confirma con Guardar catálogo y planes. La disponibilidad real depende de la versión instalada.</p></form>
      <section className={caja}><label>Plan que quieres configurar<select className={campo} aria-label="Plan del catálogo" value={plan} onChange={e => setPlan(e.target.value as typeof plan)}>{PLANES_COMERCIALES.map(p => <option key={p}>{p}</option>)}</select></label>
        <ul className="space-y-2">{datos.modulos.map(m => <li key={m.id} className="flex items-center gap-2 rounded-xl border border-line p-2"><label className="flex flex-1 items-center gap-3"><input type="checkbox" aria-label={`${m.nombre} en ${plan}`} disabled={ocupado || ["resumen", "configuracion"].includes(m.id)} checked={datos.planes[plan].includes(m.id)} onChange={e => setBorrador({ ...datos, planes: { ...datos.planes, [plan]: e.target.checked ? [...datos.planes[plan], m.id] : datos.planes[plan].filter(id => id !== m.id) } })} /><span className="text-sm font-semibold">{m.nombre}<small className="block font-normal text-ink-soft">{m.id} · {MODULOS_IMPLEMENTADOS.includes(m.id) ? "Disponible" : "En desarrollo"}</small></span></label>{!["resumen", "configuracion"].includes(m.id) && <button type="button" aria-label={`Retirar ${m.nombre}`} disabled={ocupado} className="min-h-11 min-w-11 text-danger" onClick={() => quitar(m.id)}>×</button>}</li>)}</ul>
        <div className="flex flex-wrap gap-2"><Boton disabled={!borrador || ocupado} onClick={() => void guardar(async () => { await api("/control/modulos", "PUT", borrador); setBorrador(null); await catalogo.refetch(); await consultas.invalidateQueries({ queryKey: claveConsulta(rutaEmpresa) }); })}>Guardar catálogo y planes</Boton><Boton variante="fantasma" disabled={ocupado} onClick={() => { setBorrador(null); setAviso(""); void catalogo.refetch(); }}>Descartar y actualizar</Boton></div>
      </section>
    </> : <section className={caja}>
      <label>Empresa<select aria-label="Empresa de la asignación" className={campo} value={empresa} onChange={e => { setEmpresa(e.target.value); setAsignacion(null); setAviso(""); }}>{empresas.map(e => <option value={e.id} key={e.id}>{e.nombre}</option>)}</select></label>
      {!elegida ? <p role="status">Cargando asignación…</p> : <>
        <label>Plan contratado<select aria-label="Plan contratado" className={campo} value={elegida.plan} onChange={e => setAsignacion({ ...elegida, plan: e.target.value as AsignacionModulos["plan"] })}>{PLANES_COMERCIALES.map(p => <option key={p}>{p}</option>)}</select></label>
        <p className="text-xs text-ink-soft">Las excepciones se conservan al cambiar de plan. Puedes restaurarlas para heredar únicamente lo incluido en el nuevo plan.</p>
        <ul className="space-y-2">{datos.modulos.map(m => {
          const opcion = elegida.adicionales.includes(m.id) ? "incluir" : elegida.excluidos.includes(m.id) ? "quitar" : "heredar";
          const incluido = (datos.planes[elegida.plan].includes(m.id) || opcion === "incluir") && opcion !== "quitar";
          return <li key={m.id} className="grid grid-cols-1 gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_200px]"><div className="text-sm font-semibold">{m.nombre}<small className="block font-normal text-ink-soft">{!MODULOS_IMPLEMENTADOS.includes(m.id) ? incluido ? "Reservado · en desarrollo" : "En desarrollo" : incluido ? "Habilitado" : "Sin acceso"}</small></div><select className={campo} aria-label={`Excepción ${m.nombre}`} disabled={ocupado || ["resumen", "configuracion"].includes(m.id)} value={opcion} onChange={e => setAsignacion({ ...elegida, adicionales: [...elegida.adicionales.filter(id => id !== m.id), ...(e.target.value === "incluir" ? [m.id] : [])], excluidos: [...elegida.excluidos.filter(id => id !== m.id), ...(e.target.value === "quitar" ? [m.id] : [])] })}><option value="heredar">Heredar del plan</option><option value="incluir">Incluir para esta empresa</option><option value="quitar">Quitar para esta empresa</option></select></li>;
        })}</ul>
        <div className="flex flex-wrap gap-2"><Boton disabled={ocupado || !asignacion} onClick={() => void guardar(async () => { await api(rutaEmpresa, "PUT", asignacion); setAsignacion(null); await detalle.refetch(); })}>Guardar asignación</Boton><Boton variante="fantasma" disabled={ocupado} onClick={() => setAsignacion({ ...elegida, adicionales: [], excluidos: [] })}>Restaurar herencia del plan</Boton><Boton variante="fantasma" disabled={ocupado} onClick={() => { setAsignacion(null); setAviso(""); void detalle.refetch(); }}>Descartar y actualizar</Boton></div>
      </>}
    </section>}
  </section>;
}
