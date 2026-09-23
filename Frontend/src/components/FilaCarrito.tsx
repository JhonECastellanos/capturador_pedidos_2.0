import { SelectorCantidad } from "./SelectorCantidad";
import { IconTrash } from "./Icons";
import { formatoMoneda } from "../utils/formato";
import type { Producto } from "../types";
import { VistaImagenProducto } from "./VistaImagenProducto";

interface FilaCarritoProps {
  producto: Producto;
  cantidad: number;
  onCambiarCantidad: (cantidad: number) => void;
  onQuitar: () => void;
}

export function FilaCarrito({
  producto,
  cantidad,
  onCambiarCantidad,
  onQuitar,
}: FilaCarritoProps) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <VistaImagenProducto producto={producto} tamano="sm" clickable />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-medium text-ink">{producto.nombre}</p>
          <p className="flex-shrink-0 font-mono text-[14px] font-semibold text-ink">
            {formatoMoneda(producto.precioVenta * cantidad)}
          </p>
        </div>
        <p className="mt-0.5 font-mono text-[12.5px] text-ink-soft">
          {formatoMoneda(producto.precioVenta)} / {producto.unidad}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <SelectorCantidad
            cantidad={cantidad}
            onCambiar={onCambiarCantidad}
            tamano="sm"
          />
          <button
            onClick={onQuitar}
            aria-label={`Quitar ${producto.nombre}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint active:bg-danger-soft active:text-danger"
          >
            <IconTrash width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
