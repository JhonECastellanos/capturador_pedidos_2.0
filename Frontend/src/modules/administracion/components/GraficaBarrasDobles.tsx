interface PuntoBarras {
  etiqueta: string;
  ventas: number;
  egresos: number;
}

interface GraficaBarrasDoblesProps {
  datos: PuntoBarras[];
  formato: (valor: number) => string;
}

/** Barras agrupadas por tramo de tiempo: ventas contra compras y gastos. */
export function GraficaBarrasDobles({ datos, formato }: GraficaBarrasDoblesProps) {
  const maximo = Math.max(1, ...datos.flatMap((punto) => [punto.ventas, punto.egresos]));
  return (
    <>
      <div className="mt-3 flex items-end gap-1.5">
        {datos.map((punto) => (
          <div key={punto.etiqueta} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end justify-center gap-[3px]">
              <div
                title={`Ventas ${formato(punto.ventas)}`}
                className="w-1/2 max-w-4 rounded-t bg-teal"
                style={{ height: `${(punto.ventas / maximo) * 100}%`, minHeight: punto.ventas > 0 ? "6px" : "2px" }}
              />
              <div
                title={`Compras y gastos ${formato(punto.egresos)}`}
                className="w-1/2 max-w-4 rounded-t bg-danger"
                style={{ height: `${(punto.egresos / maximo) * 100}%`, minHeight: punto.egresos > 0 ? "6px" : "2px" }}
              />
            </div>
            <span className="text-[10px] font-medium capitalize text-ink-soft">{punto.etiqueta}</span>
            <span className="font-mono text-[9.5px] text-ink-faint">{formato(punto.ventas)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-teal" /> Ventas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> Compras + gastos
        </span>
      </div>
    </>
  );
}
