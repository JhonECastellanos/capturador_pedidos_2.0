import { SelectorOpciones } from "../../../components/SelectorOpciones";
import type { MetodoPago } from "../types";

interface SelectorPagoProps { metodo: MetodoPago; onChange: (metodo: MetodoPago) => void; permitirCredito?: boolean; }

const opciones: Array<{ valor: MetodoPago; titulo: string; descripcion: string; etiqueta: string }> = [
  { valor: "efectivo", titulo: "Efectivo", descripcion: "Pago recibido ahora", etiqueta: "$" },
  { valor: "billetera", titulo: "Billetera", descripcion: "Transferencia inmediata", etiqueta: "B" },
  { valor: "credito", titulo: "Crédito", descripcion: "Registrar saldo pendiente", etiqueta: "C" },
];

export function SelectorPago({ metodo, onChange, permitirCredito = true }: SelectorPagoProps) {
  return <SelectorOpciones valor={metodo} onChange={onChange} opciones={opciones.filter((o) => permitirCredito || o.valor !== "credito")} />;
}
