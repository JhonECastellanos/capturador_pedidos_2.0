import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IScannerControls } from "@zxing/browser";

/** Solo una lectura por apertura. La cámara se libera antes de volver al formulario. */
export function EscanerCodigo({ onCodigo, onCerrar }: { onCodigo: (codigo: string) => void; onCerrar: () => void }) {
  const dialogo = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controles = useRef<IScannerControls | null>(null);
  const callbacks = useRef({ onCodigo, onCerrar });
  useEffect(() => { callbacks.current = { onCodigo, onCerrar }; });
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const entregar = useRef<(codigo: string) => void>(() => {});
  useEffect(() => {
    let vigente = true, leido = false;
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
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!vigente) return;
      const capturado = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      flujo = capturado;
      if (!vigente || leido) { parar(); return; }
      const lector = new BrowserMultiFormatReader();
      const control = await lector.decodeFromStream(capturado, video.current!, (resultado, _error, controlActual) => {
        if (!vigente || leido) { controlActual.stop(); return; }
        if (resultado) { controles.current = controlActual; entregar.current(resultado.getText()); }
      });
      if (!vigente || leido) control.stop(); else controles.current = control;
    })().catch(e => { if (vigente && !leido) setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Permite el acceso a la cámara o escribe el código." : e instanceof Error ? e.message : "No se pudo abrir la cámara."); });
    return () => { vigente = false; parar(); document.removeEventListener("keydown", tecla); document.removeEventListener("visibilitychange", ocultar); if (sonido) setTimeout(() => { void sonido?.close().catch(() => {}); }, 180); anterior?.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" onClick={e => { if (e.target === e.currentTarget) callbacks.current.onCerrar(); }}>
    <section ref={dialogo} role="dialog" aria-modal="true" aria-label="Escanear producto" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-paper p-4 shadow-xl">
      <header className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Código de barras o QR</h2><button autoFocus type="button" onClick={onCerrar} className="min-h-10 px-3 text-teal">Cerrar</button></header>
      <video ref={video} muted playsInline className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
      <p className="mt-2 text-sm text-ink-soft">Centra la etiqueta y evita reflejos. Al leerla escucharás un bip.</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); entregar.current(manual); }}><input aria-label="Código manual" value={manual} onChange={e => setManual(e.target.value)} placeholder="O escribe el código" maxLength={128} className="min-w-0 flex-1 rounded-lg border border-line bg-paper-raised px-3 py-2" /><button type="submit" disabled={!manual.trim()} className="rounded-lg bg-brand px-3 text-white disabled:opacity-40">Usar</button></form>
    </section>
  </div>, document.body);
}
