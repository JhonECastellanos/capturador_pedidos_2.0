import { useCallback, useEffect, useRef, useState } from "react";
import type { Producto } from "../types";
import { formatoMoneda } from "../utils/formato";

interface VistaImagenProductoProps {
  producto: Producto;
  tamano?: "sm" | "md";
  clickable?: boolean;
  /** Lista completa para navegar con swipe izq/der. Si no se pasa, galería de un solo item. */
  productos?: Producto[];
}

export function VistaImagenProducto({ producto, tamano = "md", clickable = false, productos }: VistaImagenProductoProps) {
  const [abierta, setAbierta] = useState(false);
  const [indice, setIndice] = useState(0);
  const [fallos, setFallos] = useState<Record<string, boolean>>({});
  const touchX = useRef<number | null>(null);

  const galeria = productos && productos.length > 0 ? productos : [producto];

  function abrir() {
    if (!clickable) return;
    const idx = galeria.findIndex((p) => p.id === producto.id);
    setIndice(idx >= 0 ? idx : 0);
    setAbierta(true);
  }

  const anterior = useCallback(() => {
    setIndice((i) => (i - 1 + galeria.length) % galeria.length);
  }, [galeria.length]);
  const siguiente = useCallback(() => {
    setIndice((i) => (i + 1) % galeria.length);
  }, [galeria.length]);

  useEffect(() => {
    if (!abierta) return;
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") anterior();
      if (e.key === "ArrowRight") siguiente();
      if (e.key === "Escape") setAbierta(false);
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [abierta, anterior, siguiente]);

  // Tarjeta pequeña: se deja tal cual
  const hayImagenMini = Boolean(producto.imagenUrl) && !fallos[producto.id];
  const medidas = tamano === "sm" ? "h-12 w-12" : "h-16 w-16";
  const contenido = hayImagenMini ? (
    <img src={producto.imagenUrl} alt={producto.nombre} onError={() => setFallos((f) => ({ ...f, [producto.id]: true }))} className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center px-1 text-center text-[9px] font-semibold leading-tight text-white"><span className="text-[13px]">{producto.nombre.slice(0, 2).toUpperCase()}</span><span className="mt-0.5 text-white/70">Sin foto</span></span>
  );

  const actual = galeria[indice] ?? producto;
  const hayImagenGrande = Boolean(actual.imagenUrl) && !fallos[actual.id];

  return (
    <>
      <button type="button" onClick={abrir} aria-label={clickable ? `Ver imagen de ${producto.nombre}` : undefined} className={`${medidas} flex-shrink-0 overflow-hidden rounded-xl ${clickable ? "cursor-zoom-in" : "cursor-default"}`} style={{ backgroundColor: producto.colorEtiqueta }}>
        {contenido}
      </button>
      {abierta && (
        <div role="dialog" aria-modal="true" aria-label={`Imagen de ${actual.nombre}`} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4" onClick={() => setAbierta(false)}>
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-paper-raised"
            onClick={(evento) => evento.stopPropagation()}
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (dx > 40) anterior();
              else if (dx < -40) siguiente();
              touchX.current = null;
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink">{actual.nombre}</p>
              <span className="flex-shrink-0 font-mono text-[11px] text-ink-faint">{galeria.length > 1 ? `${indice + 1} / ${galeria.length}` : ""}</span>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-danger-soft font-bold text-danger active:opacity-70">✕</button>
            </div>
            <div className="relative flex aspect-square items-center justify-center" style={{ backgroundColor: actual.colorEtiqueta }}>
              {hayImagenGrande ? (
                <img src={actual.imagenUrl} alt={actual.nombre} onError={() => setFallos((f) => ({ ...f, [actual.id]: true }))} className="h-full w-full object-contain" draggable={false} />
              ) : (
                <div className="px-8 text-center text-white"><p className="font-display text-xl font-semibold">Imagen pendiente</p><p className="mt-2 text-[13px] text-white/75">Aquí se verá la foto cuando se agregue desde inventario.</p></div>
              )}
              {galeria.length > 1 && (
                <>
                  <button type="button" onClick={anterior} aria-label="Anterior" className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-xl text-white active:bg-ink">‹</button>
                  <button type="button" onClick={siguiente} aria-label="Siguiente" className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-xl text-white active:bg-ink">›</button>
                </>
              )}
            </div>
            {/* Ficha completa del producto */}
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{actual.nombre}</p>
                  <p className="mt-0.5 text-[12px] text-ink-soft">{actual.categoria} · {actual.codigoInterno} · / {actual.unidad}</p>
                </div>
                <p className="flex-shrink-0 font-mono text-[14px] font-semibold text-ink">{formatoMoneda(actual.precioVenta)}</p>
              </div>
              <p className={`mt-1.5 text-[12px] font-semibold ${actual.stock <= actual.stockMinimo ? "text-danger" : "text-success"}`}>
                {actual.stock} en stock · mín {actual.stockMinimo} {actual.stock <= actual.stockMinimo ? "· alerta" : ""}
              </p>
              {galeria.length > 1 && (
                <div className="mt-2.5 flex justify-center gap-1.5">
                  {galeria.map((p, i) => (
                    <button key={p.id} type="button" aria-label={`Ir a ${p.nombre}`} onClick={() => setIndice(i)} className={`h-2 rounded-full transition-all ${i === indice ? "w-6 bg-ink" : "w-2 bg-line"}`} />
                  )).slice(0, 20)}
                </div>
              )}
              <p className="mt-2 text-center text-[11px] text-ink-faint">Desliza ← → o usa las flechas para ver los demás productos</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
