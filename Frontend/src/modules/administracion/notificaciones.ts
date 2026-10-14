export type AvisoNegocio = { id: string; titulo: string; ruta: string; creadoEn: string; leida: boolean };
let audio: AudioContext | undefined;
export function sonidoAvisosActivo() { return audio?.state === "running"; }
export async function activarAvisos() {
  if (!window.isSecureContext || !("Notification" in window)) return false;
  const permiso = Notification.requestPermission();
  if (window.AudioContext) { audio ??= new AudioContext(); void audio.resume().catch(() => {}); }
  return await permiso === "granted";
}
export function silenciarAvisos() { void audio?.close().catch(() => {}); audio = undefined; }
export async function mostrarAviso(aviso: AvisoNegocio) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (audio?.state === "running") {
    const onda = audio.createOscillator(), volumen = audio.createGain();
    volumen.gain.setValueAtTime(0.035, audio.currentTime); volumen.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
    onda.frequency.value = 880; onda.connect(volumen); volumen.connect(audio.destination); onda.start(); onda.stop(audio.currentTime + 0.16);
    onda.onended = () => { onda.disconnect(); volumen.disconnect(); };
  }
  const registro = await navigator.serviceWorker?.getRegistration();
  await registro?.showNotification("Synchronic.JO", { body: aviso.titulo, tag: aviso.id, data: { ruta: aviso.ruta }, icon: "/favicon.svg" });
}
