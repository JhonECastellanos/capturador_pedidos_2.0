import type { ReactNode } from "react";

interface Columna<T> {
  encabezado: string;
  render: (fila: T) => ReactNode;
  clase?: string;
}

interface Props<T> {
  columnas: Columna<T>[];
  filas: T[];
  getKey: (fila: T, idx: number) => string;
  vacio?: string;
}

export function TablaResponsive<T>({ columnas, filas, getKey, vacio = "Sin datos" }: Props<T>) {
  if (filas.length === 0) return <p className="rounded-xl border border-dashed border-line bg-paper-raised p-8 text-center text-[13px] text-ink-soft">{vacio}</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper-raised">
      <div className="hidden md:grid md:grid-cols-[auto]" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` }}>
        {columnas.map((col) => (
          <div key={col.encabezado} className="bg-paper-sunken px-4 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
            {col.encabezado}
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line md:divide-y-0">
        {filas.map((fila, idx) => (
          <li key={getKey(fila, idx)} className="grid gap-1 px-4 py-3 md:grid md:items-center" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` }}>
            {columnas.map((col) => (
              <div key={col.encabezado} className={col.clase}>
                <span className="md:hidden text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{col.encabezado} </span>
                {col.render(fila)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
