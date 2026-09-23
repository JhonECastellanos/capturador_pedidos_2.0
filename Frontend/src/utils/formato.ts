export function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Versión abreviada para etiquetas de gráficas ($5,2k / $1,3M). */
export function formatoMonedaCorta(valor: number): string {
  const signo = valor < 0 ? "-" : "";
  const absoluto = Math.abs(valor);
  if (absoluto >= 1000000) return `${signo}$${(absoluto / 1000000).toFixed(1).replace(".0", "").replace(".", ",")}M`;
  if (absoluto >= 1000) return `${signo}$${(absoluto / 1000).toFixed(1).replace(".0", "").replace(".", ",")}k`;
  return `${signo}$${absoluto}`;
}
