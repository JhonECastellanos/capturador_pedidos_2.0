import type { Aviso } from "./useAviso";

const clasesPorTipo = {
  exito: "bg-success",
  error: "bg-danger",
  info: "bg-ink",
} as const;

interface TiraToastProps {
  aviso: Aviso | null;
  /** Se llama después de ejecutar Deshacer (para cerrar la tira). */
  alCerrar: () => void;
  /**
   * Flotante: se muestra sobre el contenedor sin mover el contenido.
   * El padre debe ser `relative`. Fija: tira en flujo sobre la barra inferior.
   */
  flotante?: boolean;
}

/**
 * Tira de confirmación por cada elemento agregado.
 * En flujo va fija sobre la barra inferior;
 * flotante va sobre el contenedor de la lista.
 */
export function TiraToast({ aviso, alCerrar, flotante = false }: TiraToastProps) {
  if (!aviso) return null;
  return (
    <div className={flotante ? "pointer-events-none absolute inset-x-2 bottom-2 z-20" : "flex-shrink-0 px-5 pb-2 md:px-6 lg:px-8"}>
      <div
        role="status"
        className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg ${clasesPorTipo[aviso.tipo]} ${flotante ? "pointer-events-auto" : ""}`}
      >
        <span className="min-w-0 truncate">{aviso.mensaje}</span>
        {aviso.deshacer && (
          <button
            type="button"
            onClick={() => {
              aviso.deshacer?.();
              alCerrar();
            }}
            className="flex-shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-[11.5px] font-bold active:bg-white/30"
          >
            Deshacer
          </button>
        )}
      </div>
    </div>
  );
}
