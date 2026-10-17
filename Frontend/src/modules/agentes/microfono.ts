import { api, baseApi } from "../../data/api";

export async function abrirMicrofono(texto: (valor: string) => void, estado: (valor: string) => void, registrar: (detener: () => void, silenciar: (valor: boolean) => boolean) => void, pausado: () => boolean = () => false, vistaPrevia?: (valor: string) => void, nivel?: (valor: number) => void, contextoPreparado?: AudioContext) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { void contextoPreparado?.close().catch(() => {}); throw new Error("El micrófono necesita HTTPS o localhost. Abre la aplicación mediante HTTPS para dictar"); }
  const contexto = contextoPreparado ?? new AudioContext();
  void contexto.resume().catch(() => {});
  let medios: MediaStream | undefined, conexion: WebSocket | undefined, capturador: AudioWorkletNode | undefined;
  let cerrada = false, silenciado = false, lista = false, animacion = 0, intentos = 0;
  let reintento: ReturnType<typeof setTimeout> | undefined, limite: ReturnType<typeof setTimeout> | undefined;
  let cancelarEspera: (() => void) | undefined;
  const inicio = performance.now();
  const diagnostico = (fase: string, codigo?: number) => window.dispatchEvent(new CustomEvent("abinova:audio-diagnostico", { detail: { fase, milisegundos: Math.round(performance.now() - inicio), ...(codigo === undefined ? {} : { codigo }) } }));
  const reanudar = () => { if (!cerrada && contexto.state !== "running") void contexto.resume().catch(() => estado("Toca el robot para reanudar el audio suspendido por el navegador")); };
  const cambioAudio = () => { if (!cerrada && contexto.state !== "running") { diagnostico(`audio-${contexto.state}`); reanudar(); } };
  function cerrar() {
    if (cerrada) return;
    cerrada = true; lista = false;
    clearTimeout(reintento); clearTimeout(limite); cancelarEspera?.(); cancelarEspera = undefined;
    contexto.removeEventListener?.("statechange", cambioAudio);
    window.removeEventListener?.("focus", reanudar);
    cancelAnimationFrame(animacion); nivel?.(0);
    medios?.getTracks().forEach(pista => pista.stop());
    capturador?.disconnect(); conexion?.close();
    void contexto.close().catch(() => {});
    diagnostico("cerrado"); estado("Micrófono desconectado");
  }
  const silenciar = (valor: boolean) => {
    if (cerrada) return false;
    silenciado = valor;
    medios?.getAudioTracks().forEach(pista => { pista.enabled = !valor; });
    if (valor) nivel?.(0); else reanudar();
    return true;
  };
  registrar(cerrar, silenciar);
  async function conectar() {
    const { ticket } = await api<{ ticket: string }>("/agentes/audio/sesion", "POST", {});
    if (cerrada) return;
    const url = new URL(`${baseApi}/agentes/audio/conversar`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    const socket = conexion = new WebSocket(url);
    diagnostico("conectando");
    await new Promise<void>((resolve, reject) => {
      let preparada = false, terminada = false;
      const terminar = (error?: Error) => { if (terminada) return; terminada = true; clearTimeout(limite); cancelarEspera = undefined; if (error) reject(error); else resolve(); };
      cancelarEspera = () => terminar();
      limite = setTimeout(() => { terminar(new Error("El servicio de audio no respondió. Revisa Configuración y vuelve a tocar el robot")); socket.close(); }, 45000);
      socket.onerror = () => { if (!preparada) terminar(new Error("No se pudo conectar el audio. Revisa la conexión")); };
      socket.onclose = evento => {
        if (cerrada || conexion !== socket) return;
        lista = false; diagnostico("conexion-cerrada", evento?.code);
        if (!preparada) terminar(new Error("La conexión de audio terminó antes de estar lista"));
        else recuperar();
      };
      socket.onmessage = evento => {
        if (cerrada || conexion !== socket || typeof evento.data !== "string" || evento.data.length > 16000) return;
        let mensaje;
        try { mensaje = JSON.parse(evento.data); } catch { estado("Se recibió un mensaje de audio que no se pudo interpretar"); return; }
        if (!mensaje || typeof mensaje !== "object") { estado("Se recibió un mensaje de audio que no se pudo interpretar"); return; }
        if (mensaje.tipo === "listo") { preparada = true; lista = true; intentos = 0; diagnostico("listo"); terminar(); estado(silenciado ? "Micrófono silenciado · sigo procesando tu instrucción" : "Escuchando. Puedes dictar la operación completa"); }
        else if (mensaje.tipo === "reconectar") { diagnostico("renovando"); socket.close(); }
        else if (mensaje.tipo === "error") { const error = new Error(typeof mensaje.mensaje === "string" ? mensaje.mensaje : "No se pudo procesar el audio"); terminar(error); cerrar(); estado(error.message); }
        else if (mensaje.tipo === "hablando" && !pausado()) { window.speechSynthesis?.cancel(); window.dispatchEvent(new CustomEvent("abinova:agente-hablando", { detail: false })); }
        else if (mensaje.tipo === "texto" && typeof mensaje.texto === "string" && mensaje.texto.trim() && mensaje.texto.length <= 6000) vistaPrevia?.(mensaje.texto.trim());
        else if (mensaje.tipo === "instruccion" && typeof mensaje.texto === "string" && mensaje.texto.trim() && mensaje.texto.length <= 6000) texto(mensaje.texto.trim());
      };
    });
  }
  function recuperar() {
    if (cerrada || reintento !== undefined) return;
    if (++intentos > 3) { cerrar(); estado("No se pudo recuperar la conexión de audio. Conservé el detalle; toca el robot para reintentar"); return; }
    estado("Reconectando el audio · conservé el detalle"); diagnostico("reintentando");
    reintento = setTimeout(() => { reintento = undefined; void conectar().catch(() => { conexion?.close(); recuperar(); }); }, [250, 750, 1500][intentos - 1]);
  }
  try {
    // Preparar el capturador durante el permiso, sin gastar un ticket antes de concederlo.
    const modulo = contexto.audioWorklet.addModule(new URL("./captura-audio.js", import.meta.url).href);
    const captura = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }).then(stream => { if (cerrada) stream.getTracks().forEach(p => p.stop()); else medios = stream; return stream; });
    await Promise.all([modulo, captura]);
    if (cerrada) return cerrar;
    diagnostico("permiso-listo");
    medios!.getAudioTracks().forEach(pista => { pista.enabled = !silenciado; pista.addEventListener?.("ended", () => { if (!cerrada) { diagnostico("pista-terminada"); cerrar(); estado("El dispositivo cerró el micrófono. Toca el robot para volver a activarlo"); } }); });
    await conectar();
    if (cerrada) return cerrar;
    capturador = new AudioWorkletNode(contexto, "captura-abinova");
    capturador.port.onmessage = evento => {
      if (cerrada || !lista || conexion?.readyState !== WebSocket.OPEN) return;
      if (conexion.bufferedAmount > 128000) { diagnostico("audio-acumulado"); conexion.close(); return; }
      // Al reconectar se descarta el audio, sin repetir instrucciones anteriores.
      conexion.send(silenciado || pausado() ? new ArrayBuffer(evento.data.byteLength) : evento.data);
    };
    const fuente = contexto.createMediaStreamSource(medios!);
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
    contexto.addEventListener?.("statechange", cambioAudio); window.addEventListener?.("focus", reanudar);
    return cerrar;
  } catch (error) {
    cerrar();
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("Permite el acceso al micrófono para dictar. Después vuelve a tocar el robot");
    throw error;
  }
}
