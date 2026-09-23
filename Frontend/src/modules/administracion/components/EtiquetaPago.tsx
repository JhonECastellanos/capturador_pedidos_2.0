interface EtiquetaPagoProps {
  metodo: string;
  pendiente: boolean;
}

export function EtiquetaPago({ metodo, pendiente }: EtiquetaPagoProps) {
  const estilo = pendiente
    ? "bg-danger-soft text-danger"
    : metodo === "nequi"
      ? "bg-teal-soft text-teal"
      : "bg-success-soft text-success";
  const texto = pendiente ? "Crédito pendiente" : metodo === "credito" ? "Crédito pagado" : metodo;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${estilo}`}>
      {texto}
    </span>
  );
}
