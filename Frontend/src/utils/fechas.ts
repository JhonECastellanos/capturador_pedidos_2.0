/**
 * Fechas compartidas por todos los módulos.
 * Todo el almacenamiento usa ISO; los filtros trabajan con fecha local
 * para evitar desfases UTC en los cierres.
 */

export type Periodo = "hoy" | "ayer" | "semana" | "mes" | "anio" | "todo";

export const PERIODOS: Periodo[] = ["hoy", "ayer", "semana", "mes", "anio", "todo"];

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Semanal",
  mes: "Mensual",
  anio: "Año",
  todo: "Todo",
};

export function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function esMismoDia(fechaIso: string, referencia: Date): boolean {
  const fecha = new Date(fechaIso);
  return (
    fecha.getFullYear() === referencia.getFullYear() &&
    fecha.getMonth() === referencia.getMonth() &&
    fecha.getDate() === referencia.getDate()
  );
}

export function esAyer(fechaIso: string, hoy: Date): boolean {
  const ayer = inicioDelDia(hoy);
  ayer.setDate(ayer.getDate() - 1);
  return esMismoDia(fechaIso, ayer);
}

/** Ventanas móviles de los listados: hoy, ayer, últimos 7/30/365 días o todo. */
export function dentroDePeriodo(fechaIso: string, periodo: Periodo, hoy: Date): boolean {
  if (periodo === "todo") return true;
  if (periodo === "hoy") return esMismoDia(fechaIso, hoy);
  if (periodo === "ayer") return esAyer(fechaIso, hoy);
  const fecha = new Date(fechaIso);
  const desde = inicioDelDia(hoy);
  const dias = periodo === "semana" ? 7 : periodo === "mes" ? 30 : 365;
  desde.setDate(desde.getDate() - dias);
  return fecha >= desde;
}

/** Igual que `dentroDePeriodo` pero para fechas `YYYY-MM-DD` del cierre. */
export function dentroDePeriodoFecha(fechaStr: string, periodo: Periodo, hoy: Date): boolean {
  if (periodo === "todo") return true;
  const [y, m, d] = fechaStr.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return dentroDePeriodo(fecha.toISOString(), periodo, hoy);
}

export function dentroDeRangoFecha(fechaIso: string, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  const fecha = inicioDelDia(new Date(fechaIso));
  if (desde) {
    const dDesde = inicioDelDia(new Date(desde));
    if (fecha < dDesde) return false;
  }
  if (hasta) {
    const dHasta = inicioDelDia(new Date(hasta));
    dHasta.setHours(23, 59, 59, 999);
    if (fecha > dHasta) return false;
  }
  return true;
}

export function dentroDeRangoFechaStr(fechaStr: string, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  if (desde && fechaStr < desde) return false;
  if (hasta && fechaStr > hasta) return false;
  return true;
}

export function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/** Fecha local YYYY-MM-DD (sin desfase UTC). */
export function fechaLocalStr(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
