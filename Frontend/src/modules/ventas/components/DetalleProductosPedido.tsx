import type { LineaPedido } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

/** Siempre usa las líneas persistidas; no recalcula con precios vivos del catálogo. */
export function DetalleProductosPedido({ lineas }: { lineas: LineaPedido[] }) {
  return <section aria-label="Detalle de productos" className="text-left">
    <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Detalle de productos</h2>
    <ul className="space-y-1.5">
      {lineas.map((linea) => <li key={linea.productoId} className="rounded-xl border border-line bg-paper-raised px-3 py-2.5">
        <p className="break-words text-[13px] font-semibold text-ink">{linea.nombre}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 text-[12px]">
          <p className="text-ink-soft">Cantidad: <span className="font-mono font-semibold text-ink">{linea.cantidad}</span><br />Precio unitario: <span className="font-mono text-ink">{formatoMoneda(linea.precioUnitario)}</span></p>
          <p className="text-right text-ink-soft">Subtotal<br /><span className="font-mono font-semibold text-ink">{formatoMoneda(linea.subtotal)}</span></p>
        </div>
      </li>)}
    </ul>
  </section>;
}
