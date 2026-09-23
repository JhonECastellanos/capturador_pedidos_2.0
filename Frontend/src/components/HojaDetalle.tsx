import type { ReactNode } from "react";
import { IconX } from "./Icons";

interface Props {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: ReactNode;
}

export function HojaDetalle({ titulo, subtitulo, onCerrar, children }: Props) {
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 lg:items-center lg:p-6" onClick={onCerrar}>
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-paper-raised px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 lg:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-ink">{titulo}</h3>
            {subtitulo && <p className="text-[12px] text-ink-soft">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint active:bg-paper-sunken">
            <IconX width={20} height={20} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
