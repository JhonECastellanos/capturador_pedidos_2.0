import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RevisionAgente } from "@synchronic-jo/contrato";
import { useAuth } from "../../context/auth";
import { api } from "../../data/api";
import { cambiarRevisionAgente, elegirOpcionDictada, revisionAgente } from "./operacion-agente";
import { respuestaCordial } from "./conversacion";
import { sesionChat, sesionChatVigente, actualizarChat, type MensajeChat } from "./chat-estado";

export default function ChatAdmin() {
  const { usuario } = useAuth(), navegar = useNavigate();
  const [sesion] = useState(() => sesionChat(usuario!.id));
  const [mensajes, setMensajes] = useState(sesion.mensajes), [texto, setTexto] = useState("");
  const [revision, setRevision] = useState(sesion.revision), [ocupado, setOcupado] = useState(false);
  const vigente = useRef(true), ultimo = useRef<HTMLDivElement>(null);
  useEffect(() => { vigente.current = true; return () => { vigente.current = false; }; }, []);
  useEffect(() => {
    const actualizar = () => { if (sesionChatVigente(sesion)) setMensajes(sesion.mensajes); };
    window.addEventListener("synchronic:chat-consulta", actualizar);
    return () => window.removeEventListener("synchronic:chat-consulta", actualizar);
  }, [sesion]);
  useEffect(() => { ultimo.current?.scrollIntoView({ block: "nearest" }); }, [mensajes, ocupado]);
  function agregar(mensaje: MensajeChat) { actualizarChat(sesion, { mensajes: [...sesion.mensajes, mensaje].slice(-40) }); setMensajes(sesion.mensajes); }
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); const orden = texto.trim(); if (!orden || ocupado) return;
    setTexto(""); agregar({ id: crypto.randomUUID(), texto: orden, propio: true });
    const cordial = respuestaCordial(orden);
    if (cordial) { agregar({ id: crypto.randomUUID(), texto: cordial }); return; }
    if (/^cancelar[.!]?$/i.test(orden)) { if (sesion.revision && revisionAgente()?.id === sesion.revision.id) cambiarRevisionAgente(null); actualizarChat(sesion, { revision: undefined }); setRevision(undefined); agregar({ id: crypto.randomUUID(), texto: "Borrador cancelado." }); return; }
    if (/^confirmar[.!]?$/i.test(orden)) { agregar({ id: crypto.randomUUID(), texto: "Abre el detalle para revisar y confirmar con el mismo botón del formulario." }); return; }
    setOcupado(true);
    try {
      const opcion = elegirOpcionDictada(orden, sesion.revision);
      const elegida = opcion && sesion.revision ? await api<RevisionAgente>("/agentes/revisar", "POST", { instruccion: opcion, id: sesion.revision.id, version: sesion.revision.version + 1 }) : undefined;
      const r = elegida ? { respuesta: elegida.resumen, revision: elegida, resultados: [] } : await api<{ respuesta: string; revision?: RevisionAgente; resultados: MensajeChat["resultados"] }>("/agentes/chat", "POST", { texto: orden, conversacionId: sesion.conversacionId, ...(sesion.revision ? { anterior: sesion.revision.instruccion, id: sesion.revision.id, version: sesion.revision.version + 1 } : {}) });
      if (!vigente.current || !sesionChatVigente(sesion)) return;
      if (r.revision) { actualizarChat(sesion, { revision: r.revision }); setRevision(r.revision); }
      agregar({ id: crypto.randomUUID(), texto: r.respuesta, resultados: r.resultados });
    } catch (e) { if (vigente.current && sesionChatVigente(sesion)) agregar({ id: crypto.randomUUID(), texto: e instanceof Error ? e.message : "No pude responder. Conservé el borrador." }); }
    finally { if (vigente.current && sesionChatVigente(sesion)) setOcupado(false); }
  }
  return <section className="flex min-w-0 flex-1 flex-col gap-3">
    <p className="text-sm text-ink-soft">Consulta el negocio o prepara una operación. Los cambios requieren revisar el detalle y confirmar.</p>
    <div role="log" aria-label="Conversación" aria-live="polite" className="space-y-3">
      {!mensajes.length && <p className="rounded-xl border border-line bg-paper-raised p-3 text-sm">Hola. Puedes pedir «Consulta el stock de Chocorramo» o dictar un pedido completo.</p>}
      {mensajes.map(m => <article key={m.id} className={`max-w-full rounded-xl p-3 text-sm ${m.propio ? "ml-6 bg-accent-soft" : "mr-3 border border-line bg-paper-raised"}`}><p className="whitespace-pre-wrap break-words">{m.texto}</p>{m.resultados?.map((r, n) => <Link key={n} to={r.ruta} className="mt-2 block rounded-xl border border-line p-2"><strong>{r.titulo}</strong><p className="text-xs text-ink-soft">{r.detalle}</p></Link>)}</article>)}
      {ocupado && <p role="status" className="text-sm text-ink-soft">Revisando…</p>}<div ref={ultimo} />
    </div>
    {revision && <div className="rounded-xl border border-line p-3 text-sm"><p>{revision.resumen}</p>{revision.opcionesProducto?.map(o => <p key={o.texto} className="mt-1 text-xs">Opciones: {o.opciones.map(p => p.nombre).join(" · ")}</p>)}<button type="button" disabled={ocupado} className="mt-2 min-h-11 rounded-xl bg-accent px-3 font-semibold text-accent-ink" onClick={() => { cambiarRevisionAgente(revision); navegar(revision.ruta); }}>Abrir detalle para revisar y confirmar</button></div>}
    <form onSubmit={enviar} className="flex gap-2 pb-3"><label className="flex-1"><span className="sr-only">Mensaje al chatbot</span><textarea required maxLength={6000} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe lo que necesitas…" className="w-full resize-y rounded-xl border border-line bg-paper-raised p-3 text-sm" /></label><button type="submit" disabled={ocupado || !texto.trim()} className="self-end rounded-xl bg-accent px-3 py-3 text-sm font-semibold text-accent-ink disabled:opacity-50">Enviar</button></form>
  </section>;
}
