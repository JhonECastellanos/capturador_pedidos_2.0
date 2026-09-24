interface EtiquetaPagoProps {
  metodo: string;
  pendiente: boolean;
  compacta?: boolean;
}

export function EtiquetaPago({ metodo, pendiente, compacta = false }: EtiquetaPagoProps) {
  const estilo = pendiente
    ? "bg-danger-soft text-danger"
    : metodo === "nequi"
      ? "bg-teal-soft text-teal"
      : "bg-success-soft text-success";
  const texto = pendiente ? "Por cobrar" : metodo === "credito" ? "Crédito pagado" : `Pagado · ${metodo}`;
  return (
    <span className={`rounded-full font-semibold capitalize ${estilo} ${compacta ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}>
      {texto}
    </span>
  );
}
