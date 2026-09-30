import type { EventoVoz } from "@ambie/contrato";
import { api, baseApi } from "../../data/api";

export class SesionVoz {
  private socket: WebSocket | null = null;
  private audio: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private nodo: AudioWorkletNode | null = null;
  private pausada = false;
  private cerrada = false;
  private readonly recibir: (evento: EventoVoz) => void;
  private readonly nivel: (valor: number) => void;
  constructor(recibir: (evento: EventoVoz) => void, nivel: (valor: number) => void) { this.recibir = recibir; this.nivel = nivel; }
  async iniciar() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error("Para la voz necesitas HTTPS o localhost y un navegador actualizado.");
    try {
      try { this.audio = new AudioContext({ sampleRate: 16000 }); } catch { this.audio = new AudioContext(); }
      await this.audio.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (this.cerrada) { this.stream.getTracks().forEach((t) => t.stop()); return; }
      const { ticket } = await api<{ ticket: string }>("/asistente/voz/sesion", "POST", {});
      if (this.cerrada) return;
      const destino = new URL(`${baseApi}/asistente/voz`, window.location.href); destino.protocol = destino.protocol === "https:" ? "wss:" : "ws:";
      this.socket = new WebSocket(destino, ["ambie-voz", ticket]);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("No responde el servicio local de voz. Revisa el contenedor voz.")), 8000);
        this.socket!.onmessage = (e) => {
          const evento = JSON.parse(String(e.data)) as EventoVoz;
          if (evento.tipo === "lista") { window.clearTimeout(timeout); resolve(); }
          else if (evento.tipo === "error") { window.clearTimeout(timeout); reject(new Error(evento.mensaje)); }
          this.recibir(evento);
        };
        this.socket!.onerror = () => { window.clearTimeout(timeout); reject(new Error("No se pudo conectar a la voz local.")); };
        this.socket!.onclose = () => { window.clearTimeout(timeout); reject(new Error("La sesión de voz terminó.")); if (!this.cerrada) { this.recibir({ tipo: "error", mensaje: "La sesión de voz terminó. Puedes volver a conectarte." }); this.cerrar(); } };
      });
      if (this.cerrada) return;
      await this.audio.audioWorklet.addModule(`${import.meta.env.BASE_URL}voz-pcm.js`);
      if (this.cerrada) return;
      this.nodo = new AudioWorkletNode(this.audio, "ambie-pcm");
      this.nodo.port.onmessage = (e: MessageEvent<{ audio: ArrayBuffer; nivel: number }>) => {
        if (this.cerrada) return;
        this.nivel(this.pausada ? 0 : e.data.nivel);
        if (!this.pausada && this.socket?.readyState === WebSocket.OPEN) {
          if (this.socket.bufferedAmount > 64000) { this.recibir({ tipo: "error", mensaje: "La conexión de audio está lenta. Reconecta la sesión." }); this.cerrar(); return; }
          this.socket.send(e.data.audio);
        }
      };
      const fuente = this.audio.createMediaStreamSource(this.stream);
      const silencio = this.audio.createGain(); silencio.gain.value = 0;
      fuente.connect(this.nodo); this.nodo.connect(silencio); silencio.connect(this.audio.destination);
    } catch (error) { this.cerrar(); throw error; }
  }
  pausar(valor: boolean) {
    if (valor && !this.pausada && this.socket?.readyState === WebSocket.OPEN) this.socket.send('{"reset":1}');
    this.pausada = valor;
  }
  cerrar() {
    this.cerrada = true;
    this.nodo?.disconnect(); this.nodo = null;
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    if (this.audio) void this.audio.close().catch(() => undefined); this.audio = null;
    if (this.socket) { this.socket.onmessage = null; this.socket.onerror = null; this.socket.onclose = null; this.socket.close(); } this.socket = null;
  }
}

export function limitarPosicion(x: number, y: number, ancho = window.innerWidth, alto = window.innerHeight) {
  return { x: Math.max(8, Math.min(x, ancho - 64)), y: Math.max(8, Math.min(y, alto - 76)) };
}
