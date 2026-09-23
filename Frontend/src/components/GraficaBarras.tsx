interface Barra {
  etiqueta: string;
  valor: number;
  formato?: (valor: number) => string;
}

interface Props {
  datos: Barra[];
  titulo?: string;
  color?: string;
}

export function GraficaBarras({ datos, titulo, color = "var(--color-ink)" }: Props) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-4">
      {titulo && <p className="font-display text-[14px] font-semibold text-ink">{titulo}</p>}
      <div className="mt-3 flex items-end gap-2">
        {datos.map((barra) => (
          <div key={barra.etiqueta} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-20 w-full items-end justify-center">
              <div className="w-full max-w-10 rounded-t-lg transition-all" style={{ height: `${(barra.valor / max) * 100}%`, minHeight: barra.valor > 0 ? "8px" : "2px", background: color }} />
            </div>
            <span className="text-[10px] font-medium capitalize text-ink-soft">{barra.etiqueta.slice(0, 3)}</span>
            <span className="font-mono text-[10px] text-ink-faint">{barra.formato ? barra.formato(barra.valor) : String(barra.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
