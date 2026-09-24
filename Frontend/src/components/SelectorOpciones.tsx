import type { ReactNode } from "react";

export interface OpcionSelector<T extends string> {
  valor: T;
  titulo: string;
  descripcion?: string;
  etiqueta?: ReactNode;
}

interface SelectorOpcionesProps<T extends string> {
  opciones: Array<OpcionSelector<T>>;
  valor: T;
  onChange: (valor: T) => void;
  columnas?: 1 | 2 | 3;
}

const CLASE_COLUMNAS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
} as const;

/** Selector de tarjetas reutilizable (pago, entrega, tipo de crédito, etc.). */
export function SelectorOpciones<T extends string>({ opciones, valor, onChange, columnas = 3 }: SelectorOpcionesProps<T>) {
  return (
    <div className={`grid gap-2 ${CLASE_COLUMNAS[columnas]}`}>
      {opciones.map((opcion) => {
        const seleccionado = valor === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={seleccionado}
            onClick={() => onChange(opcion.valor)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              seleccionado ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink active:bg-paper-sunken"
            }`}
          >
            {opcion.etiqueta && (
              <span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[12px] font-semibold ${seleccionado ? "bg-accent text-ink" : "bg-paper-sunken text-ink-soft"}`}>
                {opcion.etiqueta}
              </span>
            )}
            <span className={`${opcion.etiqueta ? "mt-2" : ""} block text-[13px] font-semibold`}>{opcion.titulo}</span>
            {opcion.descripcion && (
              <span className={`mt-0.5 block text-[11px] leading-tight ${seleccionado ? "text-white/60" : "text-ink-soft"}`}>
                {opcion.descripcion}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
