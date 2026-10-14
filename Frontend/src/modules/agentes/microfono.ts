import { api, baseApi } from "../../data/api";

export async function abrirMicrofono(texto: (valor: string) => void, estado: (valor: string) => void, registrar: (detener: () => void, silenciar: (valor: boolean) => boolean) => void, pausado: () => boolean = () => false, vistaPrevia?: (valor: string) => void, nivel?: (valor: number) => void, contextoPreparado?: AudioContext) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { void contextoPreparado?.close().catch(() => {}); throw new Error("El micrófono necesita HTTPS o localhost. Abre la aplicación mediante HTTPS para dictar"); }
  const contexto = contextoPreparado ?? new AudioContext();
  void contexto.resume().catch(() => {});
  let medios: MediaStream | undefined;
  let conexion: WebSocket | undefined;
  let capturador: AudioWorkletNode | undefined;
  let cerrada = false;
  let silenciado = false;
  let animacion = 0;
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    cancelAnimationFrame(animacion); nivel?.(0);
    medios?.getTracks().forEach(pista => pista.stop());
    capturador?.disconnect(); conexion?.close();
    void contexto.close();
    estado("Micrófono desconectado");
  }
  const silenciar = (valor: boolean) => {
    if (cerrada) return false;
    silenciado = valor;
    medios?.getAudioTracks().forEach(pista => { pista.enabled = !valor; });
    if (valor) nivel?.(0);
    return true;
  };
  registrar(cerrar, silenciar);
  try {
    medios = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (cerrada) { medios.getTracks().forEach(pista => pista.stop()); return cerrar; }
    medios.getAudioTracks().forEach(pista => { pista.enabled = !silenciado; });
    await contexto.audioWorklet.addModule(new URL("./captura-audio.js", import.meta.url).href);
    const { ticket } = await api<{ ticket: string }>("/agentes/audio/sesion", "POST", {});
    if (cerrada) return cerrar;
    const url = new URL(`${baseApi}/agentes/audio/conversar`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    const socket = conexion = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error("El servicio de audio no respondió. Revisa Configuración y vuelve a tocar el robot")), 45000);
      const terminar = (error?: Error) => { clearTimeout(limite); if (error) reject(error); else resolve(); };
      socket.onerror = () => terminar(new Error("No se pudo conectar el audio. Revisa la conexión"));
      socket.onclose = () => { terminar(new Error("La conexión de audio terminó")); cerrar(); };
      socket.onmessage = evento => {
        if (cerrada || typeof evento.data !== "string" || evento.data.length > 16000) return;
        try {
          const mensaje = JSON.parse(evento.data);
          if (mensaje.tipo === "listo") terminar();
          else if (mensaje.tipo === "error") { const error = new Error(typeof mensaje.mensaje === "string" ? mensaje.mensaje : "No se pudo procesar el audio"); terminar(error); cerrar(); estado(error.message); }
          else if (mensaje.tipo === "hablando" && !pausado()) { window.speechSynthesis?.cancel(); window.dispatchEvent(new CustomEvent("synchronic:agente-hablando", { detail: false })); }
          else if (mensaje.tipo === "texto" && typeof mensaje.texto === "string" && mensaje.texto.trim() && mensaje.texto.length <= 6000) vistaPrevia?.(mensaje.texto.trim());
          else if (mensaje.tipo === "instruccion" && typeof mensaje.texto === "string" && mensaje.texto.trim() && mensaje.texto.length <= 6000) texto(mensaje.texto.trim());
        } catch { estado("Se recibió un mensaje de audio que no se pudo interpretar"); }
      };
    });
    if (cerrada) return cerrar;
    capturador = new AudioWorkletNode(contexto, "captura-synchronic");
    capturador.port.onmessage = evento => {
      if (cerrada || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 128000) { cerrar(); estado("La conexión está lenta. Puedes volver a iniciar el micrófono"); return; }
      socket.send(silenciado || pausado() ? new ArrayBuffer(evento.data.byteLength) : evento.data);
    };
    const fuente = contexto.createMediaStreamSource(medios);
    fuente.connect(capturador);
    if (nivel) {
      const analizador = contexto.createAnalyser(); analizador.fftSize = 256;
      fuente.connect(analizador);
      const muestras = new Float32Array(analizador.fftSize);
      const actualizar = () => {
        if (cerrada) return;
        analizador.getFloatTimeDomainData(muestras);
        const energia = Math.sqrt(muestras.reduce((total, n) => total + n * n, 0) / muestras.length);
        nivel(silenciado || pausado() ? 0 : Math.min(1, energia * 8));
        animacion = requestAnimationFrame(actualizar);
      };
      actualizar();
    }
    capturador.connect(contexto.destination);
    estado("Escuchando. Puedes dictar la operación completa");
    // El usuario controla el micrófono; el servicio conserva sus límites de sesión.
    return cerrar;
  } catch (error) {
    cerrar();
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("Permite el acceso al micrófono para dictar. Después vuelve a tocar el robot");
    throw error;
  }
}
