interface BadgeMoraProps {
  dias: number;
  compacta?: boolean;
}

/** Días de mora de un cliente, con color según severidad. */
export function BadgeMora({ dias, compacta = false }: BadgeMoraProps) {
  const clase = dias >= 8 ? "bg-danger-soft text-danger" : "bg-paper-sunken text-ink-soft";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${clase} ${compacta ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}>
      {dias === 0 ? "Al día" : `${dias} día(s) de mora`}
    </span>
  );
}
