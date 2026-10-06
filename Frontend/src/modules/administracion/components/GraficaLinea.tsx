interface PuntoLinea {
  etiqueta: string;
  valor: number;
}

interface GraficaLineaProps {
  datos: PuntoLinea[];
  formato: (valor: number) => string;
}

/** Rentabilidad: ventas menos costo de lo vendido y gastos. */
export function GraficaLinea({ datos, formato }: GraficaLineaProps) {
  const valores = datos.map((punto) => punto.valor);
  const maximo = Math.max(0, ...valores);
  const minimo = Math.min(0, ...valores);
  const rango = maximo - minimo || 1;

  // El cero siempre entra en la escala para que la línea cruce la base.
  // El área útil deja aire arriba y abajo para las etiquetas de valor.
  const xDe = (indice: number) => (datos.length <= 1 ? 50 : 5 + (indice / (datos.length - 1)) * 90);
  const yDe = (valor: number) => 74 - ((valor - minimo) / rango) * 58;

  const puntos = datos.map((punto, indice) => ({ x: xDe(indice), y: yDe(punto.valor) }));
  const yCero = yDe(0);

  /** Catmull-Rom → Bezier para trazar una curva suave sin esquinas. */
  function rutaSuave(): string {
    if (puntos.length < 2) return "";
    let ruta = `M ${puntos[0].x.toFixed(2)},${puntos[0].y.toFixed(2)}`;
    for (let indice = 0; indice < puntos.length - 1; indice += 1) {
      const anterior = puntos[Math.max(0, indice - 1)];
      const actual = puntos[indice];
      const siguiente = puntos[indice + 1];
      const dosDespues = puntos[Math.min(puntos.length - 1, indice + 2)];
      const cp1x = actual.x + (siguiente.x - anterior.x) / 6;
      const cp1y = actual.y + (siguiente.y - anterior.y) / 6;
      const cp2x = siguiente.x - (dosDespues.x - actual.x) / 6;
      const cp2y = siguiente.y - (dosDespues.y - actual.y) / 6;
      ruta += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${siguiente.x.toFixed(2)},${siguiente.y.toFixed(2)}`;
    }
    return ruta;
  }

  return (
    <div className="relative mt-5 h-32 w-full">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1={yCero} x2="100" y2={yCero} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path
          d={rutaSuave()}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {puntos.map((punto, indice) => (
        <button type="button"
          key={`marca-${datos[indice].etiqueta}`}
          aria-label={`${datos[indice].etiqueta}: rentabilidad ${formato(datos[indice].valor)}`}
          className="group absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-teal"
          style={{ left: `${punto.x}%`, top: `${punto.y}%` }}
        >
          <span className={`h-2 w-2 rounded-full ${datos[indice].valor >= 0 ? "bg-success" : "bg-danger"}`} />
          <span role="tooltip" className={`pointer-events-none absolute bottom-full mb-1 hidden w-max rounded-lg border border-line bg-paper-raised p-2 text-[11px] text-ink shadow-lg group-hover:block group-focus-visible:block ${indice === 0 ? "left-0" : indice === datos.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
            <span className="block font-semibold">{datos[indice].etiqueta}</span>
            <span className="block">Rentabilidad: {formato(datos[indice].valor)}</span>
          </span>
        </button>
      ))}
      {puntos.map((punto, indice) => (
        <span
          key={`etiqueta-${datos[indice].etiqueta}`}
          className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium capitalize text-ink-soft"
          style={{ left: `${punto.x}%`, top: "93%" }}
        >
          {datos[indice].etiqueta}
        </span>
      ))}
    </div>
  );
}
