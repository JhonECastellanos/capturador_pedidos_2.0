import { TarjetaMetrica } from "./TarjetaMetrica";

interface MetricaFiltroProps {
  etiqueta: string;
  valor: string;
  tono: "teal" | "danger" | "ink" | "accent" | "success";
  activo: boolean;
  onClick: () => void;
  tamano?: "md" | "sm";
}

/** Métrica que además filtra la lista: indica su estado con `aria-pressed`. */
export function MetricaFiltro({ etiqueta, valor, tono, activo, onClick, tamano }: MetricaFiltroProps) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-xl text-left transition-shadow ${activo ? "ring-2 ring-ink" : "hover:shadow"}`}
    >
      <TarjetaMetrica etiqueta={etiqueta} valor={valor} tono={tono} tamano={tamano} />
    </button>
  );
}
