import { api } from "../../data/api";
import type { ConfiguracionAgente } from "@abinova/contrato";
let locucion = { texto: "", hasta: 0 };
let turnoVoz = 0;
let limiteVoz: ReturnType<typeof setTimeout> | undefined;
const limpiar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function esEcoDelAsistente(texto: string) {
  return Date.now() < locucion.hasta && limpiar(texto).length > 12 && limpiar(texto) === locucion.texto;
}
export async function transcribirArchivo(archivo: Blob, audio: ConfiguracionAgente["audio"]) {
  if (!archivo.size || archivo.size > 5 * 1024 * 1024) throw new Error("El audio debe tener contenido y pesar como máximo 5 MB");
  const formato = archivo.type.split(";")[0];
  if (!["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"].includes(formato)) throw new Error("Usa un audio WAV, MP3, M4A, OGG o WebM");
  const base64 = await new Promise<string>((resolve, reject) => { const lector = new FileReader(); lector.onerror = () => reject(new Error("No se pudo leer el audio")); lector.onload = () => resolve(String(lector.result).split(",")[1]); lector.readAsDataURL(archivo); });
  return api<{ texto: string; milisegundos: number }>("/agentes/audio/transcribir", "POST", { audio: base64, formato, stt: audio.stt, modelo: audio.modeloStt, idioma: audio.idioma });
}
export function hablar(texto: string, audio: ConfiguracionAgente["audio"]) {
  if (!window.speechSynthesis) return;
  const turno = ++turnoVoz;
  clearTimeout(limiteVoz);
  window.speechSynthesis.cancel();
  window.dispatchEvent(new CustomEvent("abinova:agente-hablando", { detail: false }));
  const mensaje = new SpeechSynthesisUtterance(texto);
  locucion = { texto: limpiar(texto), hasta: Date.now() + 30_000 };
  mensaje.lang = audio.idioma; mensaje.rate = audio.velocidad; mensaje.volume = audio.volumen;
  const voz = window.speechSynthesis.getVoices().find(v => v.voiceURI === audio.voz); if (voz) mensaje.voice = voz;
  mensaje.onstart = () => { if (turno === turnoVoz) window.dispatchEvent(new CustomEvent("abinova:agente-hablando", { detail: true })); };
  const terminar = () => { if (turno !== turnoVoz) return; clearTimeout(limiteVoz); window.dispatchEvent(new CustomEvent("abinova:agente-hablando", { detail: false })); };
  mensaje.onend = terminar; mensaje.onerror = terminar;
  // Algunos navegadores omiten onend al interrumpir: no dejar el micrófono bloqueado indefinidamente.
  limiteVoz = setTimeout(() => { if (turno === turnoVoz) { window.speechSynthesis.cancel(); terminar(); } }, Math.min(60000, Math.max(5000, texto.length * 120 / audio.velocidad)));
  window.speechSynthesis.speak(mensaje);
}
