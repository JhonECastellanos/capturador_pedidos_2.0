interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
}

interface Props<T extends string> {
  opciones: Opcion<T>[];
  valor: T;
  onChange: (valor: T) => void;
  /** Variante desplazable para periodos y estados con muchas opciones. */
  desborda?: boolean;
}

export function SegmentoControl<T extends string>({ opciones, valor, onChange, desborda = false }: Props<T>) {
  if (desborda) {
    return (
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
        {opciones.map((op) => (
          <button
            key={op.valor}
            type="button"
            aria-pressed={valor === op.valor}
            onClick={() => onChange(op.valor)}
            className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
              valor === op.valor ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"
            }`}
          >
            {op.etiqueta}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="inline-flex rounded-full border border-line bg-paper-raised p-1">
      {opciones.map((op) => (
        <button
          key={op.valor}
          type="button"
          aria-pressed={valor === op.valor}
          onClick={() => onChange(op.valor)}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${valor === op.valor ? "bg-ink text-white" : "text-ink-soft"}`}
        >
          {op.etiqueta}
        </button>
      ))}
    </div>
  );
}
