import type { ReactNode } from "react";

interface TarjetaClicableProps {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/** Tarjeta táctil con teclado completo (Enter y Space) y foco visible. */
export function TarjetaClicable({ onClick, children, className = "", ariaLabel }: TarjetaClicableProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-full rounded-xl border border-line bg-paper-raised p-3 text-left shadow-sm transition-shadow hover:shadow active:bg-paper-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      {children}
    </button>
  );
}
