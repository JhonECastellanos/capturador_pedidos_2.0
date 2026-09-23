import { useState } from "react";

export interface PasoGuia {
  titulo: string;
  texto: string;
}

interface GuiaAyudaProps {
  /** Nombre de la pantalla para aria-label */
  pantalla: string;
  pasos: PasoGuia[];
}

/**
 * Bombillo pequeño al lado del título que abre una guía paso a paso
 * (overlay oscuro congelado, 3-5 pasos, adelante/atrás, X roja para salir).
 */
export function GuiaAyuda({ pantalla, pasos }: GuiaAyudaProps) {
  const [abierta, setAbierta] = useState(false);
  const [paso, setPaso] = useState(0);
  const total = pasos.length;
  const actual = pasos[Math.min(paso, total - 1)];

  function abrir() {
    setPaso(0);
    setAbierta(true);
  }

  if (total === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Ayuda de ${pantalla}`}
        title={`Cómo usar ${pantalla}`}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-line bg-paper-raised text-[15px] active:bg-paper-sunken"
      >
        💡
      </button>
      {abierta && actual && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Guía de ${pantalla}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-5"
          onClick={() => setAbierta(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-paper-raised p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Guía · {pantalla} · {paso + 1} de {total}
                </p>
                <h3 className="mt-1 font-display text-[16px] font-semibold text-ink">{actual.titulo}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAbierta(false)}
                aria-label="Cerrar guía"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-danger-soft text-base font-bold text-danger active:opacity-70"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken">
              <div className="h-full bg-accent transition-all" style={{ width: `${((paso + 1) / total) * 100}%` }} />
            </div>
            <p className="mt-3 min-h-[72px] text-[13.5px] leading-relaxed text-ink-soft">{actual.texto}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={paso === 0}
                onClick={() => setPaso((p) => Math.max(0, p - 1))}
                className="rounded-xl border border-line bg-paper py-2.5 text-[13px] font-semibold text-ink disabled:opacity-40"
              >
                ← Atrás
              </button>
              {paso < total - 1 ? (
                <button
                  type="button"
                  onClick={() => setPaso((p) => Math.min(total - 1, p + 1))}
                  className="rounded-xl bg-ink py-2.5 text-[13px] font-semibold text-white active:bg-ink/90"
                >
                  Adelante →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAbierta(false)}
                  className="rounded-xl bg-success py-2.5 text-[13px] font-semibold text-white active:opacity-90"
                >
                  Entendido ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
