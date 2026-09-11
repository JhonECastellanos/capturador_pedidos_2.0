import type { MetodoPago } from "../types";

interface SelectorPagoProps { metodo: MetodoPago; onChange: (metodo: MetodoPago) => void; }

const opciones: Array<{ valor: MetodoPago; titulo: string; descripcion: string; etiqueta: string }> = [
  { valor: "efectivo", titulo: "Efectivo", descripcion: "Pago recibido ahora", etiqueta: "$" },
  { valor: "nequi", titulo: "Nequi", descripcion: "Transferencia inmediata", etiqueta: "N" },
  { valor: "credito", titulo: "Crédito", descripcion: "Registrar saldo pendiente", etiqueta: "C" },
];

export function SelectorPago({ metodo, onChange }: SelectorPagoProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {opciones.map((opcion) => {
        const seleccionado = metodo === opcion.valor;
        return (
          <button key={opcion.valor} type="button" onClick={() => onChange(opcion.valor)} className={`rounded-xl border p-3 text-left transition-colors ${seleccionado ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink active:bg-paper-sunken"}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[12px] font-semibold ${seleccionado ? "bg-accent text-ink" : "bg-paper-sunken text-ink-soft"}`}>{opcion.etiqueta}</span>
            <span className="mt-2 block text-[13px] font-semibold">{opcion.titulo}</span>
            <span className={`mt-0.5 block text-[11px] leading-tight ${seleccionado ? "text-white/60" : "text-ink-soft"}`}>{opcion.descripcion}</span>
          </button>
        );
      })}
    </div>
  );
}
