interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onChange: (pagina: number) => void;
}

export const POR_PAGINA = 20;

export function paginar<T>(lista: T[], pagina: number, porPagina: number = POR_PAGINA): { items: T[]; totalPaginas: number; inicio: number; fin: number } {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (actual - 1) * porPagina;
  const items = lista.slice(inicio, inicio + porPagina);
  return { items, totalPaginas, inicio: lista.length === 0 ? 0 : inicio + 1, fin: inicio + items.length };
}

export function Paginacion({ pagina, totalPaginas, total, porPagina, onChange }: PaginacionProps) {
  if (total <= porPagina) return <p className="mt-3 text-center text-[11.5px] text-ink-faint">{total} registro(s)</p>;
  return (
    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-paper-raised px-3 py-2.5">
      <button
        type="button"
        disabled={pagina <= 1}
        onClick={() => onChange(pagina - 1)}
        className="rounded-lg border border-line bg-paper px-3 py-2 text-[12px] font-semibold text-ink disabled:opacity-40"
      >
        ← Anterior
      </button>
      <p className="text-center text-[11.5px] text-ink-soft">
        Página {pagina} de {totalPaginas} · {total} registro(s)
      </p>
      <button
        type="button"
        disabled={pagina >= totalPaginas}
        onClick={() => onChange(pagina + 1)}
        className="rounded-lg bg-ink px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
      >
        Siguiente →
      </button>
    </div>
  );
}
