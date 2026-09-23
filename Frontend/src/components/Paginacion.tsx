interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onChange: (pagina: number) => void;
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
