import { SelectorCantidad } from "./SelectorCantidad";
import { IconPlus } from "./Icons";
import { formatoMoneda } from "../utils/formato";
import type { Producto } from "../types";
import { VistaImagenProducto } from "./VistaImagenProducto";

interface TarjetaProductoProps {
  producto: Producto;
  cantidad: number;
  onAgregar: () => void;
  onCambiarCantidad: (cantidad: number) => void;
  /** Texto extra bajo el precio (p. ej. stock disponible). */
  detalle?: string;
}

export function TarjetaProducto({
  producto,
  cantidad,
  onAgregar,
  onCambiarCantidad,
  detalle,
}: TarjetaProductoProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5">
      <VistaImagenProducto producto={producto} tamano="sm" clickable />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">
          {producto.nombre}
        </p>
        <p className="mt-0.5 font-mono text-[13px] text-ink-soft">
          {formatoMoneda(producto.precioVenta)}{" "}
          <span className="text-ink-faint">/ {producto.unidad}</span>
        </p>
        {detalle && <p className="mt-0.5 text-[12px] text-ink-faint">{detalle}</p>}
      </div>

      {cantidad > 0 ? (
        <SelectorCantidad cantidad={cantidad} onCambiar={onCambiarCantidad} tamano="sm" />
      ) : (
        <button
          onClick={onAgregar}
          aria-label={`Agregar ${producto.nombre}`}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-ink text-white active:bg-ink/90"
        >
          <IconPlus width={18} height={18} />
        </button>
      )}
    </div>
  );
}
