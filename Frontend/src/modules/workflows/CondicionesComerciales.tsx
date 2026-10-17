import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, respuestaRed } from "../../data/api";
import { claveConsulta, consultas } from "../../data/query";
import { Boton } from "../../components/Boton";

type Condiciones = { version: number; planes: Array<{ nombre: string; precio?: number; creditosMensuales?: number; descripcion: string; beneficios: string[] }>; promocion: { descuentoAnual: number; mesesPagados: 12; mesesGratis: number; nota: string } };
const campo = "w-full rounded-xl border border-line bg-paper-raised p-2 text-sm";
export default function CondicionesComerciales() {
  const oferta = useQuery({ queryKey: claveConsulta("/comercial/planes"), queryFn: async ({ signal }) => (await respuestaRed<{ data: Condiciones }>("/comercial/planes", "GET", undefined, signal)).data });
  const [borrador, setBorrador] = useState<Condiciones | null>(null);
  const [ocupado, setOcupado] = useState(false), [mensaje, setMensaje] = useState("");
  async function guardar() {
    if (!borrador || ocupado) return;
    setOcupado(true); setMensaje("");
    try {
      await api("/comercial/planes", "PUT", { version: borrador.version, planes: borrador.planes.filter(p => p.precio !== undefined).map(({ nombre, precio, creditosMensuales, descripcion, beneficios }) => ({ nombre, precio, creditosMensuales, descripcion, beneficios })), promocion: borrador.promocion });
      setBorrador(null); await consultas.invalidateQueries({ queryKey: claveConsulta("/comercial/planes") }); setMensaje("Condiciones guardadas. La landing las leerá al abrirse.");
    } catch (e) { setMensaje(e instanceof Error ? e.message : "No se pudo guardar; conservamos los cambios."); }
    finally { setOcupado(false); }
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-line bg-paper-raised p-3 sm:p-4" aria-label="Condiciones comerciales">
    <h2 className="font-semibold">Promoción y beneficios de los planes</h2>
    <p className="text-sm text-ink-soft">Configura el descuento anual, los meses adicionales y la descripción de los tres planes con tarifa. Los nombres, usuarios y agentes contratados se conservan. Los cambios se publican al guardar.</p>
    {(mensaje || oferta.error) && <p role="status" className="text-sm">{mensaje || oferta.error?.message}</p>}
    {!borrador ? <Boton disabled={!oferta.data} onClick={() => { setMensaje(""); setBorrador(structuredClone(oferta.data!)); }}>Editar condiciones comerciales</Boton> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); void guardar(); }}>
      <div className="grid gap-3 sm:grid-cols-2"><label>Descuento anual (%)<input aria-label="Descuento anual" className={campo} type="number" required min={0} max={80} step={1} value={borrador.promocion.descuentoAnual} onChange={e => setBorrador({ ...borrador, promocion: { ...borrador.promocion, descuentoAnual: Number(e.target.value) } })} /></label><label>Meses adicionales sin costo<input aria-label="Meses adicionales" className={campo} type="number" required min={0} max={12} step={1} value={borrador.promocion.mesesGratis} onChange={e => setBorrador({ ...borrador, promocion: { ...borrador.promocion, mesesGratis: Number(e.target.value) } })} /></label></div>
      <label className="block">Condiciones de la promoción<textarea aria-label="Nota de la promoción" maxLength={400} className={campo} value={borrador.promocion.nota} onChange={e => setBorrador({ ...borrador, promocion: { ...borrador.promocion, nota: e.target.value } })} /></label>
      {borrador.planes.filter(p => p.precio !== undefined).map(p => <fieldset key={p.nombre} className="space-y-2 rounded-xl border border-line p-3"><legend className="font-semibold">{p.nombre}</legend><label className="block">Descripción<textarea aria-label={`Descripción ${p.nombre}`} required maxLength={300} className={campo} value={p.descripcion} onChange={e => setBorrador({ ...borrador, planes: borrador.planes.map(v => v.nombre === p.nombre ? { ...v, descripcion: e.target.value } : v) })} /></label><label className="block">Beneficios (uno por línea, máximo cuatro)<textarea aria-label={`Beneficios ${p.nombre}`} required rows={4} className={campo} value={p.beneficios.join("\n")} onChange={e => setBorrador({ ...borrador, planes: borrador.planes.map(v => v.nombre === p.nombre ? { ...v, beneficios: e.target.value.split("\n") } : v) })} /></label></fieldset>)}
      <div className="flex gap-2"><Boton type="submit" disabled={ocupado}>Guardar condiciones</Boton><Boton variante="fantasma" disabled={ocupado} onClick={() => setBorrador(null)}>Cancelar</Boton></div>
    </form>}
  </section>;
}
