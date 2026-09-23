interface TarjetaMetricaProps {
  etiqueta: string;
  valor: string;
  tono: "teal" | "danger" | "ink" | "accent" | "success";
  /** `sm` reduce el tamaño para dar más espacio al contenido. */
  tamano?: "md" | "sm";
}

export function TarjetaMetrica({ etiqueta, valor, tono, tamano = "md" }: TarjetaMetricaProps) {
  const clase = {
    teal: "bg-teal-soft text-teal",
    danger: "bg-danger-soft text-danger",
    ink: "bg-paper-raised text-ink",
    accent: "bg-accent-soft text-accent-dark",
    success: "bg-success-soft text-success",
  }[tono];
  const compacta = tamano === "sm";
  return (
    <div className={`rounded-xl border border-line ${clase} ${compacta ? "px-2.5 py-2" : "p-3"}`}>
      <p className={`font-mono font-semibold ${compacta ? "text-[12.5px]" : "text-[15px]"}`}>{valor}</p>
      <p className={`opacity-75 ${compacta ? "mt-0.5 text-[10px]" : "mt-1 text-[11px]"}`}>{etiqueta}</p>
    </div>
  );
}
