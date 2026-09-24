import { SegmentoControl } from "../../../components/SegmentoControl";
import type { AbonoCredito } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

interface FormularioAbonoProps {
  total: number;
  monto: string;
  metodo: AbonoCredito["metodo"];
  comentario: string;
  onMontoChange: (monto: string) => void;
  onMetodoChange: (metodo: AbonoCredito["metodo"]) => void;
  onComentarioChange: (comentario: string) => void;
}

/** Campos del abono, compartidos por la pantalla de Abonos y el módulo de Créditos. */
export function FormularioAbono({
  total,
  monto,
  metodo,
  comentario,
  onMontoChange,
  onMetodoChange,
  onComentarioChange,
}: FormularioAbonoProps) {
  const valor = Number(monto) || 0;
  const saldoTrasAbono = Math.max(0, total - valor);

  return (
    <>
      <SegmentoControl
        valor={metodo}
        onChange={onMetodoChange}
        opciones={[
          { valor: "efectivo", etiqueta: "Efectivo" },
          { valor: "nequi", etiqueta: "Nequi" },
        ]}
      />

      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={monto}
        onChange={(evento) => onMontoChange(evento.target.value)}
        placeholder={`Monto (debe ${formatoMoneda(total)})`}
        className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 font-mono text-[15px] font-semibold text-ink focus:border-ink focus:outline-none"
      />

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onMontoChange(String(total))}
          className="min-h-9 rounded-full border border-line bg-paper px-3 py-1.5 text-[11.5px] font-semibold text-ink active:bg-paper-sunken"
        >
          Liquidar todo
        </button>
        <button
          type="button"
          onClick={() => onMontoChange(String(Math.round(total / 2)))}
          className="min-h-9 rounded-full border border-line bg-paper px-3 py-1.5 text-[11.5px] font-semibold text-ink active:bg-paper-sunken"
        >
          Mitad
        </button>
      </div>

      <input
        value={comentario}
        onChange={(evento) => onComentarioChange(evento.target.value)}
        placeholder="Comentario (opcional)"
        className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
      />

      {valor > 0 && (
        <p className={`mt-1.5 text-[11.5px] font-semibold ${saldoTrasAbono === 0 ? "text-success" : "text-ink-soft"}`}>
          {saldoTrasAbono === 0 ? "✓ Liquida el crédito completo (se marca como pagado)" : `Quedará debiendo ${formatoMoneda(saldoTrasAbono)}`}
        </p>
      )}
    </>
  );
}
