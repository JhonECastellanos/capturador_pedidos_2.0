import { useState } from "react";

interface PuntoBarras {
  etiqueta: string;
  ventas: number;
  egresos: number;
}

interface GraficaBarrasDoblesProps {
  datos: PuntoBarras[];
  formato: (valor: number) => string;
  etiquetas?: readonly [string, string];
}

/** Barras agrupadas por tramo de tiempo: ventas contra compras y gastos. */
export function GraficaBarrasDobles({ datos, formato, etiquetas = ["Ventas", "Compras y gastos"] }: GraficaBarrasDoblesProps) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const maximo = Math.max(1, ...datos.flatMap((punto) => [punto.ventas, punto.egresos]));
  return (
    <>
      <div className="mt-3 flex items-end gap-1.5">
        {datos.map((punto, indice) => (
          <button type="button" key={punto.etiqueta} aria-label={`${punto.etiqueta}: ${etiquetas[0].toLocaleLowerCase()} ${formato(punto.ventas)}, ${etiquetas[1].toLocaleLowerCase()} ${formato(punto.egresos)}`} aria-expanded={seleccionado === punto.etiqueta}
            onPointerUp={(evento) => { if (evento.pointerType !== "mouse") setSeleccionado((actual) => actual === punto.etiqueta ? null : punto.etiqueta); }}
            onBlur={() => setSeleccionado(null)}
            onKeyDown={(evento) => { if (evento.key === "Escape") { setSeleccionado(null); evento.currentTarget.blur(); } }}
            className="group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-teal">
            <span role="tooltip" className={`pointer-events-none absolute bottom-full z-10 mb-1 ${seleccionado === punto.etiqueta ? "block" : "hidden"} w-max max-w-56 rounded-lg border border-line bg-paper-raised p-2 text-left text-[11px] text-ink shadow-lg [@media(hover:hover)]:group-hover:block group-focus-visible:block ${indice === 0 ? "left-0" : indice === datos.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
              <span className="block font-semibold">{punto.etiqueta}</span>
              <span className="block">{etiquetas[0]}: {formato(punto.ventas)}</span>
              <span className="block">{etiquetas[1]}: {formato(punto.egresos)}</span>
            </span>
            <div className="flex h-24 w-full items-end justify-center gap-[3px]">
              <div
                className="w-1/2 max-w-4 rounded-t bg-teal"
                style={{ height: `${(punto.ventas / maximo) * 100}%`, minHeight: punto.ventas > 0 ? "6px" : "2px" }}
              />
              <div
                className="w-1/2 max-w-4 rounded-t bg-danger"
                style={{ height: `${(punto.egresos / maximo) * 100}%`, minHeight: punto.egresos > 0 ? "6px" : "2px" }}
              />
            </div>
            <span className="text-[10px] font-medium capitalize text-ink-soft">{punto.etiqueta}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-teal" /> {etiquetas[0]}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> {etiquetas[1] === "Compras y gastos" ? "Compras + gastos" : etiquetas[1]}
        </span>
      </div>
    </>
  );
}
