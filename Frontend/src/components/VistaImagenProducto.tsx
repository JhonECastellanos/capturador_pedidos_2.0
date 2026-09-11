import { useState } from "react";
import type { Producto } from "../types";

interface VistaImagenProductoProps {
  producto: Producto;
  tamano?: "sm" | "md";
  clickable?: boolean;
}

export function VistaImagenProducto({ producto, tamano = "md", clickable = false }: VistaImagenProductoProps) {
  const [abierta, setAbierta] = useState(false);
  const [falloImagen, setFalloImagen] = useState(false);
  const hayImagen = Boolean(producto.imagenUrl) && !falloImagen;
  const medidas = tamano === "sm" ? "h-12 w-12" : "h-16 w-16";
  const contenido = hayImagen ? (
    <img src={producto.imagenUrl} alt={producto.nombre} onError={() => setFalloImagen(true)} className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center px-1 text-center text-[9px] font-semibold leading-tight text-white"><span className="text-[13px]">{producto.nombre.slice(0, 2).toUpperCase()}</span><span className="mt-0.5 text-white/70">Sin foto</span></span>
  );

  return (
    <>
      <button type="button" onClick={() => clickable && setAbierta(true)} aria-label={clickable ? `Ver imagen de ${producto.nombre}` : undefined} className={`${medidas} flex-shrink-0 overflow-hidden rounded-xl ${clickable ? "cursor-zoom-in" : "cursor-default"}`} style={{ backgroundColor: producto.colorEtiqueta }}>
        {contenido}
      </button>
      {abierta && (
        <div role="dialog" aria-modal="true" aria-label={`Imagen de ${producto.nombre}`} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-6" onClick={() => setAbierta(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-paper-raised" onClick={(evento) => evento.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><p className="truncate font-display text-[15px] font-semibold text-ink">{producto.nombre}</p><button type="button" onClick={() => setAbierta(false)} className="rounded-lg px-2 py-1 text-[13px] font-semibold text-ink-soft">Cerrar</button></div>
            <div className="flex aspect-square items-center justify-center" style={{ backgroundColor: producto.colorEtiqueta }}>
              {hayImagen ? <img src={producto.imagenUrl} alt={producto.nombre} className="h-full w-full object-contain" /> : <div className="text-center text-white"><p className="font-display text-xl font-semibold">Imagen pendiente</p><p className="mt-2 px-8 text-[13px] text-white/75">Aquí se verá la foto cuando se agregue en public/assets/productos o desde inventario.</p></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
