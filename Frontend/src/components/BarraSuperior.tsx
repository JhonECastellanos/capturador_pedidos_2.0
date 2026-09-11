import type { ReactNode } from "react";
import { IconArrowLeft } from "./Icons";

interface BarraSuperiorProps {
  titulo: string;
  subtitulo?: string;
  onVolver?: () => void;
  derecha?: ReactNode;
  paso?: { actual: number; total: number };
}

export function BarraSuperior({
  titulo,
  subtitulo,
  onVolver,
  derecha,
  paso,
}: BarraSuperiorProps) {
  return (
    <header className="sticky top-0 z-10 flex-shrink-0 bg-ink px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white md:px-6">
      <div className="flex items-center gap-3">
        {onVolver ? (
          <button
            onClick={onVolver}
            aria-label="Volver"
            className="-ml-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full active:bg-white/10"
          >
            <IconArrowLeft width={20} height={20} />
          </button>
        ) : (
          <div className="w-1" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[19px] font-semibold leading-tight">
            {titulo}
          </h1>
          {subtitulo && (
            <p className="truncate text-[13px] text-white/60">{subtitulo}</p>
          )}
        </div>
        {derecha}
      </div>

      {paso && (
        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: paso.total }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < paso.actual ? "bg-accent" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      )}
    </header>
  );
}
