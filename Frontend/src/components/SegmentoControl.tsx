interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
}

interface Props<T extends string> {
  opciones: Opcion<T>[];
  valor: T;
  onChange: (valor: T) => void;
}

export function SegmentoControl<T extends string>({ opciones, valor, onChange }: Props<T>) {
  return (
    <div className="inline-flex rounded-full border border-line bg-paper-raised p-1">
      {opciones.map((op) => (
        <button
          key={op.valor}
          type="button"
          onClick={() => onChange(op.valor)}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${valor === op.valor ? "bg-ink text-white" : "text-ink-soft"}`}
        >
          {op.etiqueta}
        </button>
      ))}
    </div>
  );
}
