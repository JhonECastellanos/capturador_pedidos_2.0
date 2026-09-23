type Periodo = "todo" | "ayer" | "semana" | "mes";

interface Props {
  valor: Periodo;
  onChange: (valor: Periodo) => void;
}

const opciones: Periodo[] = ["todo", "ayer", "semana", "mes"];

export function SelectorPeriodo({ valor, onChange }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {opciones.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium capitalize ${valor === p ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
