import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IScannerControls } from "@zxing/browser";

/** Solo una lectura por apertura. La cámara se libera antes de volver al formulario. */
export function EscanerCodigo({ onCodigo, onCerrar }: { onCodigo: (codigo: string) => void; onCerrar: () => void }) {
  const dialogo = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controles = useRef<Pick<IScannerControls, "stop"> | null>(null);
  const callbacks = useRef({ onCodigo, onCerrar });
  useEffect(() => { callbacks.current = { onCodigo, onCerrar }; });
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [manual, setManual] = useState("");
  const entregar = useRef<(codigo: string) => void>(() => {});
  useEffect(() => {
    let vigente = true, leido = false;
    setError(""); setLeyendo(false);
    let flujo: MediaStream | null = null;
    let sonido: AudioContext | null = null;
    const anterior = document.activeElement as HTMLElement | null;
    const parar = () => { controles.current?.stop(); controles.current = null; flujo?.getTracks().forEach(t => t.stop()); };
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
      const permiso = navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false }).then(capturado => {
        flujo = capturado;
        if (!vigente || leido) capturado.getTracks().forEach(t => t.stop());
        return capturado;
      });
      const [capturado, { BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([permiso, import("@zxing/browser"), import("@zxing/library")]);
      if (!vigente || leido) { parar(); return; }
      const pista = capturado.getVideoTracks()[0];
      const capacidades = pista.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
      if (capacidades.focusMode?.includes("continuous")) void pista.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
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
      controles.current = { stop: () => clearTimeout(temporizador) };
      const leer = () => {
        if (!vigente || leido) return;
        const giro = vuelta++ % 4, indice = giro % 2;
        const lienzo = lienzos[indice], pincel = contextos[indice];
        const ancho = indice ? vista.videoHeight : vista.videoWidth, alto = indice ? vista.videoWidth : vista.videoHeight;
        if (ancho && alto && vista.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (lienzo.width !== ancho || lienzo.height !== alto) { lienzo.width = ancho; lienzo.height = alto; }
          pincel.setTransform(1, 0, 0, 1, 0, 0); pincel.translate(ancho / 2, alto / 2); pincel.rotate(giro * Math.PI / 2);
          pincel.drawImage(vista, -vista.videoWidth / 2, -vista.videoHeight / 2);
          try { entregar.current(lector.decodeFromCanvas(lienzo).getText()); }
          catch { /* Un reflejo o una orientación difícil se revisan en el siguiente fotograma. */ }
        }
        if (vigente && !leido) temporizador = setTimeout(leer, 120);
      };
      setLeyendo(true); leer();

    })().catch(e => { if (vigente && !leido) { parar(); setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Permite el acceso a la cámara o escribe el código." : e instanceof Error ? e.message : "No se pudo abrir la cámara."); } });
    return () => { vigente = false; parar(); document.removeEventListener("keydown", tecla); document.removeEventListener("visibilitychange", ocultar); if (sonido) setTimeout(() => { void sonido?.close().catch(() => {}); }, 180); anterior?.focus(); };
  }, [intento]);
  return createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" onClick={e => { if (e.target === e.currentTarget) callbacks.current.onCerrar(); }}>
    <section ref={dialogo} role="dialog" aria-modal="true" aria-label="Escanear producto" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-paper p-4 shadow-xl">
      <header className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Código de barras o QR</h2><button autoFocus type="button" onClick={onCerrar} className="min-h-10 px-3 text-teal">Cerrar</button></header>
      <video ref={video} autoPlay muted playsInline className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
      <p className="mt-2 text-sm text-ink-soft">{leyendo ? "Centra la etiqueta y evita reflejos. Al leerla escucharás un bip." : "Abriendo la cámara y preparando el lector…"}</p>
      {error && <div role="alert" className="mt-2 text-sm text-danger">{error}<button type="button" onClick={() => setIntento(n => n + 1)} className="ml-2 min-h-10 underline">Reintentar cámara</button></div>}
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); entregar.current(manual); }}><input aria-label="Código manual" value={manual} onChange={e => setManual(e.target.value)} placeholder="O escribe el código" maxLength={128} className="min-w-0 flex-1 rounded-lg border border-line bg-paper-raised px-3 py-2" /><button type="submit" disabled={!manual.trim()} className="rounded-lg bg-brand px-3 text-white disabled:opacity-40">Usar</button></form>
    </section>
  </div>, document.body);
}
