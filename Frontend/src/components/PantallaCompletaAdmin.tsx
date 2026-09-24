import type { ReactNode } from "react";

interface PantallaCompletaAdminProps {
  children: ReactNode;
  className?: string;
}

/**
 * Overlay a pantalla completa para procesos del administrador.
 * Centraliza el `lg:left-60` que debe coincidir con el sidebar desktop.
 */
export function PantallaCompletaAdmin({ children, className = "" }: PantallaCompletaAdminProps) {
  return (
    <section className={`fixed inset-0 z-40 flex flex-col overflow-hidden bg-paper lg:left-60 ${className}`}>
      {children}
    </section>
  );
}
