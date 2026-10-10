import { api, baseApi } from "../../data/api";

export async function abrirMicrofono(texto: (valor: string) => void, estado: (valor: string) => void, registrar: (detener: () => void) => void, pausado: () => boolean = () => false, vistaPrevia?: (valor: string) => void) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("El micrófono necesita HTTPS o localhost. Puedes usar un archivo de audio o escribir la instrucción");
  const contexto = new AudioContext();
  await contexto.resume();
  let medios: MediaStream | undefined;
  let conexion: WebSocket | undefined;
  let capturador: AudioWorkletNode | undefined;
  let cerrada = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    clearTimeout(temporizador);
    medios?.getTracks().forEach(pista => pista.stop());
    capturador?.disconnect(); conexion?.close();
    void contexto.close();
    estado("Micrófono desconectado");
  }
  registrar(cerrar);
  try {
    medios = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (cerrada) { medios.getTracks().forEach(pista => pista.stop()); return cerrar; }
    await contexto.audioWorklet.addModule(new URL("./captura-audio.js", import.meta.url).href);
    const { ticket } = await api<{ ticket: string }>("/agentes/audio/sesion", "POST", {});
    if (cerrada) return cerrar;
    const url = new URL(`${baseApi}/agentes/audio/conversar`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    const socket = conexion = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error("El servicio de audio no respondió. Puedes continuar con texto")), 45000);
      const terminar = (error?: Error) => { clearTimeout(limite); if (error) reject(error); else resolve(); };
      socket.onerror = () => terminar(new Error("No se pudo conectar el audio. Revisa la conexión"));
      socket.onclose = () => { terminar(new Error("La conexión de audio terminó")); cerrar(); };
      socket.onmessage = evento => {
        if (cerrada || typeof evento.data !== "string" || evento.data.length > 16000) return;
        try {
          const mensaje = JSON.parse(evento.data);
          if (mensaje.tipo === "listo") terminar();
          else if (mensaje.tipo === "error") { const error = new Error(typeof mensaje.mensaje === "string" ? mensaje.mensaje : "No se pudo procesar el audio"); terminar(error); cerrar(); estado(error.message); }
          else if (mensaje.tipo === "texto" && typeof mensaje.texto === "string" && mensaje.texto.trim() && mensaje.texto.length <= 6000) vistaPrevia?.(mensaje.texto.trim());
          else if (mensaje.tipo === "instruccion" && typeof mensaje.texto === "string" && mensaje.texto.trim() && mensaje.texto.length <= 6000) texto(mensaje.texto.trim());
        } catch { estado("Se recibió un mensaje de audio que no se pudo interpretar"); }
      };
    });
    if (cerrada) return cerrar;
    capturador = new AudioWorkletNode(contexto, "captura-ambie");
    capturador.port.onmessage = evento => {
      if (cerrada || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 128000) { cerrar(); estado("La conexión está lenta. Puedes volver a iniciar el micrófono"); return; }
      socket.send((pausado() || window.speechSynthesis?.speaking) ? new ArrayBuffer(evento.data.byteLength) : evento.data);
    };
    contexto.createMediaStreamSource(medios).connect(capturador);
    capturador.connect(contexto.destination);
    estado("Escuchando. Puedes dictar la operación completa");
    temporizador = setTimeout(cerrar, 120000);
    return cerrar;
  } catch (error) {
    cerrar();
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("Permite el acceso al micrófono para dictar. También puedes escribir la instrucción");
    throw error;
  }
}
