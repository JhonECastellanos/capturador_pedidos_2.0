import { SelectorOpciones } from "../../../components/SelectorOpciones";
import type { MetodoPago } from "../types";

interface SelectorPagoProps { metodo: MetodoPago; onChange: (metodo: MetodoPago) => void; }

const opciones: Array<{ valor: MetodoPago; titulo: string; descripcion: string; etiqueta: string }> = [
  { valor: "efectivo", titulo: "Efectivo", descripcion: "Pago recibido ahora", etiqueta: "$" },
  { valor: "nequi", titulo: "Nequi", descripcion: "Transferencia inmediata", etiqueta: "N" },
  { valor: "credito", titulo: "Crédito", descripcion: "Registrar saldo pendiente", etiqueta: "C" },
];

export function SelectorPago({ metodo, onChange }: SelectorPagoProps) {
  return <SelectorOpciones valor={metodo} onChange={onChange} opciones={opciones} />;
}
