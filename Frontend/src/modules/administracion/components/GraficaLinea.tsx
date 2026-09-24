interface PuntoLinea {
  etiqueta: string;
  valor: number;
}

interface GraficaLineaProps {
  datos: PuntoLinea[];
  formato: (valor: number) => string;
}

/** Línea de tiempo de la rentabilidad: lo que queda después de compras y gastos. */
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
        <span
          key={`marca-${datos[indice].etiqueta}`}
          className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${datos[indice].valor >= 0 ? "bg-success" : "bg-danger"}`}
          style={{ left: `${punto.x}%`, top: `${punto.y}%` }}
        />
      ))}
      {puntos.map((punto, indice) => (
        <span
          key={`valor-${datos[indice].etiqueta}`}
          className={`absolute -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] font-semibold ${datos[indice].valor >= 0 ? "text-success" : "text-danger"}`}
          style={{ left: `${punto.x}%`, top: `${punto.y}%`, marginTop: datos[indice].valor >= 0 ? "-15px" : "5px" }}
        >
          {formato(datos[indice].valor)}
        </span>
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
