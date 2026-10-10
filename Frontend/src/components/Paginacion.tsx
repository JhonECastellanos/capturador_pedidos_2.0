import { useRef } from "react";

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onChange: (pagina: number) => void;
}

export function Paginacion({ pagina, totalPaginas, total, porPagina, onChange }: PaginacionProps) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const ultima = Math.max(1, totalPaginas);
  const actual = Math.min(Math.max(1, pagina), ultima);
  const cambiar = (siguiente: number) => { const destino = Math.min(Math.max(1, siguiente), ultima); if (destino !== actual) onChange(destino); };
  return (
    <nav aria-label="Paginación" className="paginador my-1.5 flex shrink-0 items-center justify-center gap-3" style={{ touchAction: "pan-y" }}
      onTouchStart={e => { const toque = e.touches[0]; inicio.current = { x: toque.clientX, y: toque.clientY }; }}
      onTouchCancel={() => { inicio.current = null; }}
      onTouchEnd={e => { const toque = e.changedTouches[0], origen = inicio.current; inicio.current = null; if (!origen) return; const x = toque.clientX - origen.x, y = toque.clientY - origen.y; if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(y) * 1.5) cambiar(actual + (x < 0 ? 1 : -1)); }}>
      <button
        type="button"
        disabled={actual <= 1}
        aria-label="Página anterior"
        onClick={() => cambiar(actual - 1)}
        className="relative flex h-7 w-8 items-center justify-center text-[20px] font-semibold leading-none text-ink disabled:opacity-30 before:absolute before:-inset-y-2 before:inset-x-0"
      >
        ←
      </button>
      <p className="min-w-10 text-center text-[12px] font-semibold tabular-nums text-ink" title={`${porPagina} registros por página`} aria-label={`Página ${actual} de ${ultima}, ${total} registros`}>
        {actual}/{ultima}
      </p>
      <button
        type="button"
        disabled={actual >= ultima}
        aria-label="Página siguiente"
        onClick={() => cambiar(actual + 1)}
        className="relative flex h-7 w-8 items-center justify-center text-[20px] font-semibold leading-none text-ink disabled:opacity-30 before:absolute before:-inset-y-2 before:inset-x-0"
      >
        →
      </button>
    </nav>
  );
}
