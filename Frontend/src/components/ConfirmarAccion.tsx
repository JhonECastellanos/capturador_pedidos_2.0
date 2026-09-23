interface ConfirmarAccionProps {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  tono?: "peligro" | "exito" | "ink";
  alConfirmar: () => void;
  alCancelar: () => void;
}

const estilosPorTono = {
  peligro: "bg-danger",
  exito: "bg-success",
  ink: "bg-ink",
} as const;

const iconosPorTono = {
  peligro: "!",
  exito: "✓",
  ink: "?",
} as const;

/**
 * Confirmación antes de operaciones críticas
 * (cancelar pedido, cambiar precio, abonar, eliminar, ajustar stock).
 * Hoja inferior en móvil, diálogo centrado en escritorio.
 */
/**
 * Confirmación antes de operaciones críticas
 * (cancelar pedido, cambiar precio, abonar, eliminar, ajustar stock…).
 * Se muestra como un módulo flotante al centro de la pantalla, con el
 * mismo diseño de la app en todos los módulos.
 */
export function ConfirmarAccion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar,
  tono = "ink",
  alConfirmar,
  alCancelar,
}: ConfirmarAccionProps) {
  if (!abierto) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 p-6"
      onClick={alCancelar}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-paper-raised px-5 py-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-display text-[18px] font-bold text-white ${estilosPorTono[tono]}`}
          >
            {iconosPorTono[tono]}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-[16px] font-semibold text-ink">{titulo}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{mensaje}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={alCancelar}
            className="rounded-xl border border-line bg-paper py-3 text-[13.5px] font-semibold text-ink active:bg-paper-sunken"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={alConfirmar}
            className={`rounded-xl py-3 text-[13.5px] font-semibold text-white active:opacity-90 ${estilosPorTono[tono]}`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
