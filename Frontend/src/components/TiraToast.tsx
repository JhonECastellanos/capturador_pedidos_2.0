import type { Aviso } from "./useAviso";

const clasesPorTipo = {
  exito: "bg-success",
  error: "bg-danger",
  info: "bg-ink",
} as const;

interface TiraToastProps {
  aviso: Aviso | null;
  /** Se llama después de ejecutar Deshacer (para cerrar el aviso). */
  alCerrar: () => void;
}

/**
 * Aviso flotante al centro de la pantalla: no mueve el contenido,
 * se lee de un vistazo y desaparece rápido (ver `useAviso`).
 * No bloquea la interacción salvo el botón Deshacer.
 */
export function TiraToast({ aviso, alCerrar }: TiraToastProps) {
  if (!aviso) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div
        role="status"
        className={`pointer-events-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[13px] font-semibold text-white shadow-2xl ${clasesPorTipo[aviso.tipo]}`}
      >
        <span className="min-w-0">{aviso.mensaje}</span>
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
