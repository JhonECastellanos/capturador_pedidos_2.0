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

  return (
    <div className="relative mt-5 h-32 w-full">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1={yCero} x2="100" y2={yCero} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <polyline
          points={puntos.map((punto) => `${punto.x},${punto.y}`).join(" ")}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
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
