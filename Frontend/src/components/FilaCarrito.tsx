import { SelectorCantidad } from "./SelectorCantidad";
import { IconTrash } from "./Icons";
import { formatoMoneda } from "../utils/formato";
import type { ItemCarrito } from "../types";
import { VistaImagenProducto } from "./VistaImagenProducto";

interface FilaCarritoProps {
  item: ItemCarrito;
  onCambiarCantidad: (cantidad: number) => void;
  onQuitar: () => void;
}

export function FilaCarrito({
  item,
  onCambiarCantidad,
  onQuitar,
}: FilaCarritoProps) {
  const { producto, cantidad } = item;

  return (
    <div className="flex items-start gap-3 py-3.5">
      <VistaImagenProducto producto={producto} tamano="sm" clickable />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-medium text-ink">{producto.nombre}</p>
          <p className="flex-shrink-0 font-mono text-[14px] font-semibold text-ink">
            {formatoMoneda(producto.precio * cantidad)}
          </p>
        </div>
        <p className="mt-0.5 font-mono text-[12.5px] text-ink-soft">
          {formatoMoneda(producto.precio)} / {producto.unidad}
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint active:bg-danger-soft active:text-danger"
          >
            <IconTrash width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
