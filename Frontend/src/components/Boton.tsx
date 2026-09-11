import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  children: ReactNode;
  icono?: ReactNode;
  ancho?: "auto" | "completo";
}

const estilosPorVariante: Record<Variante, string> = {
  primario:
    "bg-ink text-white active:bg-ink/90 disabled:bg-ink-faint disabled:text-white/70",
  secundario:
    "bg-accent text-ink active:bg-accent-dark disabled:bg-accent-soft disabled:text-ink-faint",
  fantasma:
    "bg-transparent text-ink border border-line active:bg-paper-sunken disabled:text-ink-faint",
  peligro:
    "bg-transparent text-danger active:bg-danger-soft disabled:text-ink-faint",
};

export function Boton({
  variante = "primario",
  children,
  icono,
  ancho = "completo",
  className = "",
  ...rest
}: BotonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-sans text-[15px] font-semibold tracking-tight transition-colors disabled:cursor-not-allowed ${
        ancho === "completo" ? "w-full" : ""
      } ${estilosPorVariante[variante]} ${className}`}
      {...rest}
    >
      {icono}
      {children}
    </button>
  );
}
