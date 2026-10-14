import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IScannerControls } from "@zxing/browser";

type CapacidadesCamara = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean; zoom?: { min: number; max: number; step: number } };
type DetectorNativo = { detect: (imagen: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ConstructorDetector = { new (opciones: { formats: string[] }): DetectorNativo; getSupportedFormats: () => Promise<string[]> };

/** Solo una lectura por apertura. La cámara se libera antes de volver al formulario. */
export function EscanerCodigo({ onCodigo, onCerrar }: { onCodigo: (codigo: string) => void; onCerrar: () => void }) {
  const dialogo = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCodigo, onCerrar });
  useEffect(() => { callbacks.current = { onCodigo, onCerrar }; });
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [manual, setManual] = useState("");
  const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([]);
  const [camaraId, setCamaraId] = useState(() => { try { return sessionStorage.getItem("synchronic:camara-preferida") ?? ""; } catch { return ""; } });
  const [camaraActual, setCamaraActual] = useState("");
  const [capacidades, setCapacidades] = useState<CapacidadesCamara>({});
  const [linterna, setLinterna] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pistaActual = useRef<MediaStreamTrack | null>(null);
  const entregar = useRef<(codigo: string) => void>(() => {});
  useEffect(() => {
    let vigente = true, leido = false;
    setError(""); setLeyendo(false); setCapacidades({}); setLinterna(false);
    let flujo: MediaStream | null = null;
    let controles: Pick<IScannerControls, "stop"> | null = null;
    let sonido: AudioContext | null = null;
    const anterior = document.activeElement as HTMLElement | null;
    const parar = () => { controles?.stop(); controles = null; flujo?.getTracks().forEach(t => t.stop()); if (pistaActual.current === flujo?.getVideoTracks()[0]) pistaActual.current = null; };
    entregar.current = codigo => {
      const limpio = codigo.trim();
      if (!vigente || leido || !limpio) return;
      if (limpio.length > 128 || /[\x00-\x1f\x7f]/.test(limpio)) { setError("Este código no es válido. Escanea la etiqueta del producto."); return; }
      leido = true; parar();
      if (sonido?.state === "running") {
        const tono = sonido.createOscillator(), volumen = sonido.createGain();
        tono.frequency.value = 1100; volumen.gain.value = 0.08;
        tono.connect(volumen); volumen.connect(sonido.destination); tono.start(); tono.stop(sonido.currentTime + 0.12);
      }
      callbacks.current.onCodigo(limpio);
    };
    const cerrar = () => { parar(); callbacks.current.onCerrar(); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "Tab") {
        const elementos = dialogo.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
        if (!elementos?.length) return;
        const primero = elementos[0], ultimo = elementos[elementos.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
    };
    const ocultar = () => { if (document.hidden) cerrar(); };
    document.addEventListener("keydown", tecla); document.addEventListener("visibilitychange", ocultar);
    try { sonido = new AudioContext(); void sonido.resume().catch(() => {}); } catch { /* La lectura funciona también con el dispositivo silenciado. */ }
    void (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("La cámara necesita una conexión HTTPS. También puedes escribir el código.");
      const resolucion = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 24 } };
      const permiso = navigator.mediaDevices.getUserMedia({ video: { ...(camaraId ? { deviceId: { exact: camaraId } } : { facingMode: { ideal: "environment" } }), ...resolucion }, audio: false }).catch(error => {
        if (!camaraId || !(error instanceof DOMException) || !["NotFoundError", "OverconstrainedError"].includes(error.name)) throw error;
        try { sessionStorage.removeItem("synchronic:camara-preferida"); } catch { /* El lector no depende del almacenamiento del navegador. */ }
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, ...resolucion }, audio: false });
      }).then(capturado => {
        flujo = capturado;
        if (!vigente || leido) capturado.getTracks().forEach(t => t.stop());
        return capturado;
      });
      const [capturado, { BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([permiso, import("@zxing/browser"), import("@zxing/library")]);
      if (!vigente || leido) { parar(); return; }
      const pista = capturado.getVideoTracks()[0];
      pistaActual.current = pista;
      setCamaraActual(pista.getSettings().deviceId ?? "");
      const soportado = pista.getCapabilities?.() as CapacidadesCamara | undefined;
      setCapacidades(soportado ?? {}); setZoom((pista.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? soportado?.zoom?.min ?? 1);
      if (soportado?.focusMode?.includes("continuous")) await pista.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      if (!vigente || leido) { parar(); return; }
      void navigator.mediaDevices.enumerateDevices().then(dispositivos => { if (vigente && !leido) setCamaras(dispositivos.filter(d => d.kind === "videoinput")); }).catch(() => {});
      // Chrome Android aprovecha el lector del dispositivo; ZXing queda como respaldo.
      let nativo: DetectorNativo | null = null;
      const Constructor = (window as Window & { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
      if (Constructor) {
        try {
          const admitidos = await Constructor.getSupportedFormats();
          const formatos = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"].filter(f => admitidos.includes(f));
          if (formatos.length) nativo = new Constructor({ formats: formatos });
        } catch { /* Navegadores sin implementación completa usan ZXing. */ }
      }
      if (!vigente || leido) { parar(); return; }
      const pistas = new Map<import("@zxing/library").DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true], [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.DATA_MATRIX]]]);
      const vista = video.current!;
      vista.srcObject = capturado;
      await vista.play();
      // El canvas de ZXing conserva el tamaño inicial: esperar un fotograma válido.
      await new Promise<void>((resolve, reject) => {
        const inicio = performance.now();
        const comprobar = () => {
          if (!vigente || leido) { resolve(); return; }
          if (vista.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && vista.videoWidth > 0 && vista.videoHeight > 0) { resolve(); return; }
          if (performance.now() - inicio > 10000) { reject(new Error("La cámara no entregó imagen. Pulsa Reintentar cámara")); return; }
          requestAnimationFrame(comprobar);
        };
        comprobar();
      });
      if (!vigente || leido) { parar(); return; }
      const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 500, tryPlayVideoTimeout: 10000 });
      const lienzos = [document.createElement("canvas"), document.createElement("canvas")];
      const contextos = lienzos.map(l => l.getContext("2d", { willReadFrequently: true })!);
      let vuelta = 0;
      let temporizador: ReturnType<typeof setTimeout>;
      controles = { stop: () => clearTimeout(temporizador) };
      const leer = async () => {
        if (!vigente || leido) return;
        if (nativo && vista.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try { const detectados = await nativo.detect(vista); if (vigente && !leido && detectados[0]) entregar.current(detectados[0].rawValue); }
          catch { nativo = null; }
        }
        if (!vigente || leido) return;
        const paso = vuelta++ % 8, giro = paso % 4, recorte = paso >= 4, indice = giro % 2;
        const lienzo = lienzos[indice], pincel = contextos[indice];
        // La banda central mejora el contraste de barras pequeñas sin perder sus márgenes.
        const fuenteAlto = recorte ? Math.round(vista.videoHeight * 0.4) : vista.videoHeight;
        const fuenteY = recorte ? Math.round((vista.videoHeight - fuenteAlto) / 2) : 0;
        const ancho = indice ? fuenteAlto : vista.videoWidth, alto = indice ? vista.videoWidth : fuenteAlto;
        if (ancho && alto && vista.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (lienzo.width !== ancho || lienzo.height !== alto) { lienzo.width = ancho; lienzo.height = alto; }
          pincel.setTransform(1, 0, 0, 1, 0, 0); pincel.translate(ancho / 2, alto / 2); pincel.rotate(giro * Math.PI / 2);
          pincel.drawImage(vista, 0, fuenteY, vista.videoWidth, fuenteAlto, -vista.videoWidth / 2, -fuenteAlto / 2, vista.videoWidth, fuenteAlto);
          try { entregar.current(lector.decodeFromCanvas(lienzo).getText()); }
          catch { /* Un reflejo o una orientación difícil se revisan en el siguiente fotograma. */ }
        }
        if (vigente && !leido) temporizador = setTimeout(() => void leer(), 160);
      };
      setLeyendo(true); void leer();

    })().catch(e => { if (vigente && !leido) { parar(); setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Permite el acceso a la cámara o escribe el código." : e instanceof Error ? e.message : "No se pudo abrir la cámara."); } });
    return () => { vigente = false; parar(); document.removeEventListener("keydown", tecla); document.removeEventListener("visibilitychange", ocultar); if (sonido) setTimeout(() => { void sonido?.close().catch(() => {}); }, 180); anterior?.focus(); };
  }, [intento, camaraId]);
  async function ajustarCamara(valor: MediaTrackConstraintSet) {
    try { await pistaActual.current?.applyConstraints({ advanced: [valor] }); return true; }
    catch { setError("Esta cámara no admite ese ajuste. Acerca la etiqueta con buena luz o elige otra cámara."); return false; }
  }
  return createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" onClick={e => { if (e.target === e.currentTarget) callbacks.current.onCerrar(); }}>
    <section ref={dialogo} role="dialog" aria-modal="true" aria-label="Escanear producto" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-paper p-4 shadow-xl">
      <header className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Código de barras o QR</h2><button autoFocus type="button" onClick={onCerrar} className="min-h-10 px-3 text-teal">Cerrar</button></header>
      <div className="relative overflow-hidden rounded-xl bg-black"><video ref={video} autoPlay muted playsInline className="aspect-[4/3] w-full object-contain" /><div aria-hidden="true" className="pointer-events-none absolute inset-x-[6%] top-[35%] h-[30%] rounded-lg border-2 border-white/80" /></div>
      <p className="mt-2 text-sm text-ink-soft">{leyendo ? "Coloca todas las barras dentro del marco, con margen a ambos lados. Aleja un poco la cámara para enfocar; evita reflejos. Al leer escucharás un bip." : "Abriendo la cámara y preparando el lector…"}</p>
      {camaras.length > 1 && <label className="mt-2 flex items-center gap-2 text-xs">Cámara<select aria-label="Cambiar cámara" value={camaraActual} onChange={e => { setCamaraId(e.target.value); try { sessionStorage.setItem("synchronic:camara-preferida", e.target.value); } catch { /* Conserva la elección en memoria cuando el almacenamiento está deshabilitado. */ } }} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1">{camaras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Cámara ${i + 1}`}</option>)}</select></label>}
      {(capacidades.torch || capacidades.zoom) && <div className="mt-2 flex items-center gap-3">
        {capacidades.torch && <button type="button" aria-pressed={linterna} onClick={() => { const activar = !linterna; void ajustarCamara({ torch: activar } as MediaTrackConstraintSet).then(ok => { if (ok) setLinterna(activar); }); }} className="min-h-10 rounded-lg border border-line px-3 text-xs">{linterna ? "Apagar luz" : "Encender luz"}</button>}
        {capacidades.zoom && <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">Acercar<input aria-label="Zoom de cámara" type="range" min={capacidades.zoom.min} max={Math.min(capacidades.zoom.max, Math.max(3, capacidades.zoom.min))} step={capacidades.zoom.step || 0.1} value={zoom} onChange={e => { const valor = Number(e.target.value); setZoom(valor); void ajustarCamara({ zoom: valor } as MediaTrackConstraintSet); }} className="min-w-0 flex-1 accent-teal" /></label>}
      </div>}
      {error && <div role="alert" className="mt-2 text-sm text-danger">{error}<button type="button" onClick={() => setIntento(n => n + 1)} className="ml-2 min-h-10 underline">Reintentar cámara</button></div>}
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); entregar.current(manual); }}><input aria-label="Código manual" value={manual} onChange={e => setManual(e.target.value)} placeholder="O escribe el código" maxLength={128} className="min-w-0 flex-1 rounded-lg border border-line bg-paper-raised px-3 py-2" /><button type="submit" disabled={!manual.trim()} className="rounded-lg bg-brand px-3 text-white disabled:opacity-40">Usar</button></form>
    </section>
  </div>, document.body);
}
