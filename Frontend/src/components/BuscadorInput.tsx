import type { ReactNode } from "react";
import { IconSearch } from "./Icons";

interface Props {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  accion?: ReactNode;
}

export function BuscadorInput({ value, onChange, placeholder = "Buscar", autoFocus, accion }: Props) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5">
      <IconSearch width={18} height={18} className="text-ink-faint" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
      {accion}
    </div>
  );
}
