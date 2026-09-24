import type { ReactNode } from "react";

interface ListaVaciaProps {
  titulo: string;
  texto?: string;
  icono?: ReactNode;
  accion?: { etiqueta: string; onClick: () => void };
  compacta?: boolean;
}

/** Estado vacío unificado para listas y paneles. */
export function ListaVacia({ titulo, texto, icono, accion, compacta = false }: ListaVaciaProps) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised text-center ${compacta ? "px-4 py-6" : "px-4 py-10"}`}>
      {icono}
      <p className={`font-medium text-ink ${compacta ? "text-[12.5px]" : "text-[13px]"}`}>{titulo}</p>
      {texto && <p className="mt-0.5 max-w-sm text-[11.5px] text-ink-soft">{texto}</p>}
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="mt-3 rounded-xl bg-ink px-4 py-2 text-[12.5px] font-semibold text-white active:bg-ink/90"
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
