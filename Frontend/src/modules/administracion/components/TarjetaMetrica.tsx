interface TarjetaMetricaProps {
  etiqueta: string;
  valor: string;
  tono: "teal" | "danger" | "ink" | "accent";
}

export function TarjetaMetrica({ etiqueta, valor, tono }: TarjetaMetricaProps) {
  const clase = {
    teal: "bg-teal-soft text-teal",
    danger: "bg-danger-soft text-danger",
    ink: "bg-paper-raised text-ink",
    accent: "bg-accent-soft text-accent-dark",
  }[tono];
  return (
    <div className={`rounded-xl border border-line p-3 ${clase}`}>
      <p className="font-mono text-[15px] font-semibold">{valor}</p>
      <p className="mt-1 text-[11px] opacity-75">{etiqueta}</p>
    </div>
  );
}
