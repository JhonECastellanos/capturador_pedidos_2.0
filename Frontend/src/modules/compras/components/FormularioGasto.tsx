import { useState, type FormEvent } from "react";

interface FormularioGastoProps {
  alGuardar: (concepto: string, monto: number) => void;
}

/** Alta rápida de gasto: concepto y monto, con egreso inmediato en caja. */
export function FormularioGasto({ alGuardar }: FormularioGastoProps) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = Number(monto);
    if (!concepto.trim() || !valor || valor <= 0) return;
    alGuardar(concepto.trim(), valor);
    setConcepto("");
    setMonto("");
  }

  return (
    <form onSubmit={guardar} className="mt-2 rounded-xl border border-line bg-paper-raised p-2.5">
      <p className="text-[12px] font-semibold text-ink">Registrar gasto</p>
      <div className="mt-1.5 flex gap-2">
        <input
          required
          value={concepto}
          onChange={(evento) => setConcepto(evento.target.value)}
          placeholder="Concepto (ej. Insumos, bolsas)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2.5 text-[12.5px] text-ink focus:border-ink focus:outline-none"
        />
        <input
          required
          type="number"
          min={1}
          value={monto}
          onChange={(evento) => setMonto(evento.target.value)}
          placeholder="$ Monto"
          className="w-24 rounded-lg border border-line bg-paper px-3 py-2.5 text-[12.5px] text-ink focus:border-ink focus:outline-none"
        />
        <button type="submit" className="min-h-11 flex-shrink-0 rounded-lg bg-ink px-3 py-2 text-[12px] font-semibold text-white active:bg-ink/90">
          Guardar
        </button>
      </div>
    </form>
  );
}
