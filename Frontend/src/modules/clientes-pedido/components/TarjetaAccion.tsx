import type { ReactNode } from "react";
import { IconChevronRight } from "../../../components/Icons";

interface TarjetaAccionProps {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  tono: "acento" | "teal";
  onClick: () => void;
}

export function TarjetaAccion({ titulo, descripcion, icono, tono, onClick }: TarjetaAccionProps) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-paper-raised p-4 text-left shadow-[0_12px_28px_-16px_rgba(31,42,60,0.35)] transition-transform active:scale-[0.99]">
      <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${tono === "acento" ? "bg-accent-soft text-accent-dark" : "bg-teal-soft text-teal"}`}>{icono}</span>
      <span className="min-w-0 flex-1"><span className="block font-display text-[17px] font-semibold text-ink">{titulo}</span><span className="mt-0.5 block text-[13px] text-ink-soft">{descripcion}</span></span>
      <IconChevronRight width={20} height={20} className="flex-shrink-0 text-ink-faint" />
    </button>
  );
}
