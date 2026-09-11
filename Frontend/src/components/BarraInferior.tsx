import type { ReactNode } from "react";

export function BarraInferior({ children }: { children: ReactNode }) {
  return (
    <div className="flex-shrink-0 border-t border-line bg-paper-raised px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:px-6">
      {children}
    </div>
  );
}
