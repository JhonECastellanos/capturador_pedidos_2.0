import { useEffect, useRef } from "react";

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
  const fila = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const contenedor = fila.current;
    const activo = contenedor?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (contenedor && activo && contenedor.scrollWidth > contenedor.clientWidth) {
      contenedor.scrollTo({ left: activo.offsetLeft - (contenedor.clientWidth - activo.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [valor]);
  if (desborda) {
    return (
      <div ref={fila} className="segmento-control relative no-scrollbar flex min-w-0 max-w-full gap-1.5 overflow-x-auto pb-0.5">
        {opciones.map((op) => (
          <button
            key={op.valor}
            type="button"
            aria-pressed={valor === op.valor}
            onClick={() => onChange(op.valor)}
            className={`flex-shrink-0 whitespace-nowrap rounded-[10px] border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
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
    <div ref={fila} className="segmento-control relative no-scrollbar inline-flex min-w-0 w-fit max-w-full overflow-x-auto rounded-[10px] border border-line bg-paper-raised p-1">
      {opciones.map((op) => (
        <button
          key={op.valor}
          type="button"
          aria-pressed={valor === op.valor}
          onClick={() => onChange(op.valor)}
          className={`flex-shrink-0 whitespace-nowrap rounded-[10px] px-4 py-1.5 text-[13px] font-semibold ${valor === op.valor ? "bg-ink text-white" : "text-ink-soft"}`}
        >
          {op.etiqueta}
        </button>
      ))}
    </div>
  );
}
