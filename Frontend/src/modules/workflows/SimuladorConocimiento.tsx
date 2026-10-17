import { useRef, useState } from "react";
import { api } from "../../data/api";
import { Boton } from "../../components/Boton";
import { textoEstado, uuidWorkflow } from "./grafo-modelo";
import type { ModuloWorkflow, ResultadoSimulador } from "./conocimiento-modelo";

export function SimuladorConocimiento({ raiz, modulos, cambiosPendientes }: { raiz: string; modulos: ModuloWorkflow[]; cambiosPendientes: boolean }) {
  const [texto, setTexto] = useState("");
  const [modulo, setModulo] = useState("");
  const [conversacion, setConversacion] = useState<string>(uuidWorkflow);
  const [historial, setHistorial] = useState<Array<{ texto: string; resultado: ResultadoSimulador }>>([]);
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState("");
  const bloqueo = useRef(false);
  const elegido = modulo || modulos.find(m => m.habilitado)?.id || "";
  const habilitado = modulos.some(m => m.id === elegido && m.habilitado);
  function nuevaConversacion() { setConversacion(uuidWorkflow()); setHistorial([]); setError(""); }
  async function probar() {
    if (bloqueo.current || !texto.trim() || !habilitado || cambiosPendientes) return;
    bloqueo.current = true; setOcupado(true); setError("");
    const pregunta = texto.trim();
    try {
      const resultado = await api<ResultadoSimulador>(`${raiz}/probar`, "POST", { texto: pregunta, conversacion, modulo: elegido });
      setConversacion(resultado.conversacion);
      setHistorial(anterior => [...anterior, { texto: pregunta, resultado }]);
      setTexto("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la prueba."); }
    finally { bloqueo.current = false; setOcupado(false); }
  }
  return <section className="wf-inspector" aria-label="Simulador de conocimiento">
    <h3 className="font-semibold">Simulador</h3>
    <p className="wf-ayuda">Prueba la configuración guardada. No guarda ventas ni confirma operaciones del negocio. La consulta de IA puede consumir el cupo configurado.</p>
    {cambiosPendientes && <p role="status" className="wf-ayuda">Guarda los cambios antes de probar para que la respuesta corresponda al documento visible.</p>}
    {!modulos.some(m => m.habilitado) && <p role="status" className="wf-ayuda">Selecciona y guarda al menos un módulo habilitado en la configuración para probar.</p>}
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void probar(); }}>
      <fieldset disabled={ocupado} className="space-y-3">
        <label>Módulo de la prueba<select value={elegido} onChange={e => { setModulo(e.target.value); nuevaConversacion(); }}><option value="" disabled>Selecciona un módulo</option>{modulos.map(m => <option key={m.id} value={m.id} disabled={!m.habilitado}>{m.nombre}{!m.habilitado ? " · No habilitado" : ""}</option>)}</select></label>
        <label>Mensaje de prueba<textarea rows={3} required maxLength={4000} value={texto} onChange={e => setTexto(e.target.value)} /></label>
      </fieldset>
      <div className="wf-acciones"><Boton type="submit" disabled={ocupado || !texto.trim() || !habilitado || cambiosPendientes}>{ocupado ? "Probando…" : "Probar mensaje"}</Boton><Boton variante="fantasma" disabled={ocupado} onClick={nuevaConversacion}>Nueva conversación</Boton></div>
    </form>
    {ocupado && <p role="status">Consultando el simulador…</p>}
    {error && <p role="alert" className="wf-error">{error}</p>}
    <ol className="space-y-3" aria-label="Conversación de prueba">{historial.map(({ texto: pregunta, resultado }, i) => <li key={i} className="wf-simulacion">
      <p className="wf-resultado"><strong>Tú: </strong>{pregunta}</p>
      <p className="wf-resultado"><strong>ABI: </strong>{resultado.respuesta}</p>
      <p className="wf-ayuda">Documento utilizado · versión {resultado.version}</p>
      <h4 className="font-semibold">Traza de nodos</h4>
      <ol className="wf-traza">{resultado.pasos.map((paso, indice) => <li key={indice} data-estado={paso.estado}><strong>{indice + 1}. {paso.nombre}</strong><span>{textoEstado(paso.estado)}</span>{paso.detalle && <p className="wf-resultado">{paso.detalle}</p>}</li>)}</ol>
      {resultado.pasos.length === 0 && <p className="wf-ayuda">El servidor no devolvió pasos para esta prueba.</p>}
      <p className="wf-ayuda">Fuentes utilizadas: {resultado.fuentes.length ? resultado.fuentes.map(f => f.nombre).join(", ") : "Ninguna reportada"}</p>
    </li>)}</ol>
  </section>;
}
