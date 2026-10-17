import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RevisionAgente } from "@abinova/contrato";
import { useAuth } from "../../context/auth";
import { api } from "../../data/api";
import { cambiarRevisionAgente, elegirOpcionDictada, revisionAgente, useRevisionAgente, useOperacionAgente } from "./operacion-agente";
import { esConfirmacion, respuestaCordial } from "./conversacion";
import { useOperaciones } from "../../context/operaciones";
import { guardarDesdeChat } from "./guardar-chat";
import { DetalleProductosPedido } from "../ventas/components/DetalleProductosPedido";
import type { LineaPedido } from "../../types";
import { formatoMoneda } from "../../utils/formato";
import { sesionChat, sesionChatVigente, actualizarChat, type MensajeChat } from "./chat-estado";

export default function ChatAdmin() {
  const { usuario } = useAuth(), operaciones = useOperaciones();
  const [sesion] = useState(() => sesionChat(usuario!.id));
  const [mensajes, setMensajes] = useState(sesion.mensajes), [texto, setTexto] = useState("");
  const revision = useRevisionAgente(), [ocupado, setOcupado] = useState(false);
  const vigente = useRef(true), ultimo = useRef<HTMLDivElement>(null);
  useEffect(() => { vigente.current = true; return () => { vigente.current = false; }; }, []);
  useEffect(() => {
    const actualizar = () => { if (sesionChatVigente(sesion)) setMensajes(sesion.mensajes); };
    window.addEventListener("abinova:chat-consulta", actualizar);
    return () => window.removeEventListener("abinova:chat-consulta", actualizar);
  }, [sesion]);
  useEffect(() => { ultimo.current?.scrollIntoView({ block: "nearest" }); }, [mensajes, ocupado]);
  function agregar(mensaje: MensajeChat) { actualizarChat(sesion, { mensajes: [...sesion.mensajes, mensaje].slice(-40) }); setMensajes(sesion.mensajes); }
  const confirmar = useOperacionAgente(revision?.instruccion.operacion ?? "pedido", () => {}, async () => revision && revisionAgente() === revision ? guardarDesdeChat(revision, operaciones, usuario!.id) : false, () => revision!.instruccion, false);
  async function confirmarEnChat() {
    if (ocupado || !revision || revisionAgente() !== revision || revision.faltantes.length) { agregar({ id: crypto.randomUUID(), texto: revisionAgente()?.resumen ?? "Primero prepara una operación para revisar." }); return; }
    setOcupado(true);
    try { const guardado = await confirmar(); if (vigente.current && sesionChatVigente(sesion)) agregar({ id: crypto.randomUUID(), texto: guardado ? "Operación guardada correctamente." : revisionAgente()?.resumen ?? "No se guardó. Revisa el detalle y vuelve a confirmar." }); }
    finally { if (vigente.current) setOcupado(false); }
  }
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); const orden = texto.trim(); if (!orden || ocupado) return;
    setTexto(""); agregar({ id: crypto.randomUUID(), texto: orden, propio: true });
    const cordial = respuestaCordial(orden);
    if (cordial) { agregar({ id: crypto.randomUUID(), texto: cordial }); return; }
    if (/^cancelar[.!]?$/i.test(orden)) { cambiarRevisionAgente(null); actualizarChat(sesion, { revision: undefined }); agregar({ id: crypto.randomUUID(), texto: "Borrador cancelado." }); return; }
    if (esConfirmacion(orden)) { if (revision && !esConfirmacion(orden, revision.instruccion.operacion)) agregar({ id: crypto.randomUUID(), texto: "Esa confirmación corresponde a otra operación. Revisa el detalle preparado." }); else await confirmarEnChat(); return; }
    setOcupado(true);
    try {
      const anterior = revisionAgente(), opcion = elegirOpcionDictada(orden, anterior);
      const elegida = opcion && anterior ? await api<RevisionAgente>("/agentes/revisar", "POST", { instruccion: opcion, id: anterior.id, version: anterior.version + 1 }) : undefined;
      const r = elegida ? { respuesta: elegida.resumen, revision: elegida, resultados: [] } : await api<{ respuesta: string; revision?: RevisionAgente; resultados: MensajeChat["resultados"] }>("/agentes/chat", "POST", { texto: orden, conversacionId: sesion.conversacionId, ...(anterior ? { anterior: anterior.instruccion, id: anterior.id, version: anterior.version + 1 } : {}) });
      if (!vigente.current || !sesionChatVigente(sesion)) return;
      if (revisionAgente() !== anterior) { agregar({ id: crypto.randomUUID(), texto: "El detalle cambió mientras respondía. Conservé la última corrección." }); return; }
      if (r.revision) { actualizarChat(sesion, { revision: r.revision }); cambiarRevisionAgente(r.revision); }
      agregar({ id: crypto.randomUUID(), texto: r.respuesta, resultados: r.resultados });
    } catch (e) { if (vigente.current && sesionChatVigente(sesion)) agregar({ id: crypto.randomUUID(), texto: e instanceof Error ? e.message : "No pude responder. Conservé el borrador." }); }
    finally { if (vigente.current && sesionChatVigente(sesion)) setOcupado(false); }
  }
  return <section className="flex min-w-0 flex-1 flex-col gap-3">
    <p className="text-sm text-ink-soft">Consulta el negocio, corrige el detalle y confirma aquí para guardarlo.</p>
    <div role="log" aria-label="Conversación" aria-live="polite" className="space-y-3">
      {!mensajes.length && <p className="rounded-xl border border-line bg-paper-raised p-3 text-sm">Hola. Puedes pedir «Consulta el stock de Chocorramo» o dictar un pedido completo.</p>}
      {mensajes.map(m => <article key={m.id} className={`max-w-full rounded-xl p-3 text-sm ${m.propio ? "ml-6 bg-accent-soft" : "mr-3 border border-line bg-paper-raised"}`}><p className="whitespace-pre-wrap break-words">{m.texto}</p>{m.resultados?.map((r, n) => <Link key={n} to={r.ruta} className="mt-2 block rounded-xl border border-line p-2"><strong>{r.titulo}</strong><p className="text-xs text-ink-soft">{r.detalle}</p></Link>)}</article>)}
      {ocupado && <p role="status" className="text-sm text-ink-soft">Revisando…</p>}<div ref={ultimo} />
    </div>
    {revision && <section aria-label="Detalle por confirmar" className="rounded-xl border border-line p-3 text-sm space-y-2"><p>{revision.resumen}</p><p>{revision.instruccion.ocasional ? "Cliente ocasional" : revision.instruccion.cliente ?? revision.instruccion.proveedor ?? revision.instruccion.concepto ?? revision.instruccion.producto ?? revision.instruccion.referencia}</p>
      {Array.isArray(revision.datos.lineas) && <DetalleProductosPedido lineas={revision.datos.lineas as LineaPedido[]} />}
      <p>{revision.instruccion.preparacion === "pendiente" ? "Por preparar" : revision.instruccion.preparacion === "entregado" ? "Entregado ahora" : revision.instruccion.estado ?? ""}{revision.instruccion.metodo ? ` · ${revision.instruccion.metodo}` : ""}</p>
      {revision.total && <p className="font-semibold">Total: {formatoMoneda(Number(revision.total))}</p>}
      {revision.instruccion.producto && <p>Producto: {revision.instruccion.producto}{revision.instruccion.cantidad !== undefined ? ` · Cantidad: ${revision.instruccion.cantidad}` : ""}</p>}
      {revision.instruccion.precio !== undefined && <p>Valor de venta: {formatoMoneda(Number(revision.instruccion.precio))}</p>}
      {revision.instruccion.monto !== undefined && <p>Importe: {formatoMoneda(Number(revision.instruccion.monto))}</p>}
      {revision.instruccion.fecha && <p>Fecha: {revision.instruccion.fecha}</p>}
      {revision.instruccion.tipoConteo && <p>Conteo: {revision.instruccion.tipoConteo === "aleatorio" ? "Diario" : revision.instruccion.tipoConteo === "inicial" ? "Inicial" : "General"}</p>}
      {revision.instruccion.efectivo !== undefined && <p>Efectivo contado: {formatoMoneda(Number(revision.instruccion.efectivo))}</p>}
      {revision.instruccion.billetera !== undefined && <p>Billetera contada: {formatoMoneda(Number(revision.instruccion.billetera))}</p>}
      {revision.opcionesProducto?.map(o => <p key={o.texto} className="text-xs">Opciones: {o.opciones.map(p => p.nombre).join(" · ")}</p>)}
      <button type="button" disabled={ocupado || !!revision.faltantes.length} className="min-h-11 rounded-xl bg-accent px-3 font-semibold text-accent-ink disabled:opacity-50" onClick={() => void confirmarEnChat()}>Confirmar operación</button>
    </section>}
    <form onSubmit={enviar} className="flex gap-2 pb-3 pr-16 md:pr-0"><label className="min-w-0 flex-1"><span className="sr-only">Mensaje al chatbot</span><textarea required maxLength={6000} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe lo que necesitas…" className="w-full resize-y rounded-xl border border-line bg-paper-raised p-3 text-sm" /></label><button type="submit" disabled={ocupado || !texto.trim()} className="self-end rounded-xl bg-accent px-3 py-3 text-sm font-semibold text-accent-ink disabled:opacity-50">Enviar</button></form>
  </section>;
}
