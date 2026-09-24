import type { ReactNode } from "react";
import { IconArrowLeft } from "./Icons";

interface BarraSuperiorProps {
  titulo: string;
  subtitulo?: string;
  /** Rótulo pequeño sobre el título, usado en la cabecera hero. */
  etiqueta?: string;
  onVolver?: () => void;
  derecha?: ReactNode;
  paso?: { actual: number; total: number };
  variante?: "normal" | "hero";
}

export function BarraSuperior({
  titulo,
  subtitulo,
  etiqueta,
  onVolver,
  derecha,
  paso,
  variante = "normal",
}: BarraSuperiorProps) {
  const esHero = variante === "hero";
  return (
    <header className={`sticky top-0 z-10 flex-shrink-0 bg-ink px-4 pt-[max(1rem,env(safe-area-inset-top))] text-white md:px-6 ${esHero ? "pb-7" : "pb-4"}`}>
      <div className={`flex gap-3 ${esHero ? "items-start" : "items-center"}`}>
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
          {etiqueta && <p className="text-[13px] text-accent">{etiqueta}</p>}
          <h1 className={`truncate font-display font-semibold leading-tight ${esHero ? "mt-1 text-2xl" : "text-[19px]"}`}>
            {titulo}
          </h1>
          {subtitulo && (
            <p className={`truncate text-white/60 ${esHero ? "mt-1 text-[13px]" : "text-[13px]"}`}>{subtitulo}</p>
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
