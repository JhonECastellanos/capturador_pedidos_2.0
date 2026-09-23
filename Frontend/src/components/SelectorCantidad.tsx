import { IconMinus, IconPlus } from "./Icons";

interface SelectorCantidadProps {
  cantidad: number;
  onCambiar: (cantidad: number) => void;
  tamano?: "sm" | "md";
}

export function SelectorCantidad({
  cantidad,
  onCambiar,
  tamano = "md",
}: SelectorCantidadProps) {
  // Objetivo táctil mínimo de 44px en ambas variantes.
  const alto = "h-11";
  const anchoBoton = tamano === "sm" ? "w-9" : "w-11";

  return (
    <div
      className={`inline-flex ${alto} items-center rounded-lg border border-line bg-paper-raised`}
    >
      <button
        type="button"
        onClick={() => onCambiar(Math.max(0, cantidad - 1))}
        aria-label="Disminuir cantidad"
        className={`flex ${anchoBoton} h-full items-center justify-center text-ink-soft active:bg-paper-sunken`}
      >
        <IconMinus width={16} height={16} />
      </button>
      <span className="w-7 text-center font-mono text-[14px] font-semibold tabular-nums">
        {cantidad}
      </span>
      <button
        type="button"
        onClick={() => onCambiar(cantidad + 1)}
        aria-label="Aumentar cantidad"
        className={`flex ${anchoBoton} h-full items-center justify-center text-ink active:bg-paper-sunken`}
      >
        <IconPlus width={16} height={16} />
      </button>
    </div>
  );
}
