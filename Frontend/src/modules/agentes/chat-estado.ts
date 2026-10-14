import type { RevisionAgente } from "@synchronic-jo/contrato";
import { claveConsulta } from "../../data/query";
export type MensajeChat = { id: string; texto: string; propio?: boolean; resultados?: Array<{ titulo: string; detalle: string; ruta: string }> };
let estado = { usuario: "", sesion: -1, conversacionId: "", mensajes: [] as MensajeChat[], revision: undefined as RevisionAgente | undefined };
export function sesionChat(usuario: string) {
  const sesion = claveConsulta("/agentes/chat")[1];
  if (estado.usuario !== usuario || estado.sesion !== sesion) estado = { usuario, sesion, conversacionId: crypto.randomUUID(), mensajes: [], revision: undefined };
  return estado;
}
export function sesionChatVigente(sesion: ReturnType<typeof sesionChat>) { return sesion === estado && sesion.sesion === claveConsulta("/agentes/chat")[1]; }
export function actualizarChat(sesion: ReturnType<typeof sesionChat>, cambios: Partial<ReturnType<typeof sesionChat>>) {
  if (sesionChatVigente(sesion)) Object.assign(sesion, cambios);
}
export function consultaDictada(usuario: string, texto: string, respuesta: { respuesta: string; resultados?: MensajeChat["resultados"] }) {
  const sesion = sesionChat(usuario);
  actualizarChat(sesion, { mensajes: [...sesion.mensajes, { id: crypto.randomUUID(), texto, propio: true }, { id: crypto.randomUUID(), texto: respuesta.respuesta, resultados: respuesta.resultados }].slice(-40) });
  window.dispatchEvent(new Event("synchronic:chat-consulta"));
}
window.addEventListener("synchronic:sesion-expirada", () => { estado = { usuario: "", sesion: -1, conversacionId: "", mensajes: [], revision: undefined }; });
window.addEventListener("synchronic:agente-guardado", e => { if (estado.revision?.id === (e as CustomEvent<string>).detail) estado.revision = undefined; });
