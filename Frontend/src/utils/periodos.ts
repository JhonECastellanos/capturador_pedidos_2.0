/**
 * Tramos de tiempo para las gráficas del tablero: siempre una línea
 * de tiempo en el eje X (día, semana, mes o año).
 */

export type Granularidad = "dia" | "semana" | "mes" | "anio";

export interface Tramo {
  etiqueta: string;
  inicio: Date;
  fin: Date;
}

/** Periodos rápidos para los listados (los tops del tablero). */
export type PeriodoLista = "dia" | "semana" | "mes" | "anio" | "todo";

function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function etiquetaCorta(fecha: Date): string {
  return fecha.toLocaleDateString("es-CO", { weekday: "short" }).replace(".", "");
}

/** Construye los tramos del periodo, del más antiguo al más reciente. */
export function tramosDe(granularidad: Granularidad, referencia: Date): Tramo[] {
  const base = inicioDelDia(referencia);

  if (granularidad === "dia") {
    return Array.from({ length: 7 }, (_, i) => {
      const inicio = new Date(base);
      inicio.setDate(inicio.getDate() - (6 - i));
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 1);
      return { etiqueta: etiquetaCorta(inicio), inicio, fin };
    });
  }

  if (granularidad === "semana") {
    // Semanas de lunes a domingo, la última es la de esta fecha.
    const lunesActual = new Date(base);
    lunesActual.setDate(lunesActual.getDate() - ((lunesActual.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, i) => {
      const inicio = new Date(lunesActual);
      inicio.setDate(inicio.getDate() - (7 - i) * 7);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 7);
      return { etiqueta: `${inicio.getDate()}/${inicio.getMonth() + 1}`, inicio, fin };
    });
  }

  if (granularidad === "mes") {
    return Array.from({ length: 6 }, (_, i) => {
      const inicio = new Date(base.getFullYear(), base.getMonth() - (5 - i), 1);
      const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
      return { etiqueta: inicio.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""), inicio, fin };
    });
  }

  return Array.from({ length: 5 }, (_, i) => {
    const inicio = new Date(base.getFullYear() - (4 - i), 0, 1);
    const fin = new Date(inicio.getFullYear() + 1, 0, 1);
    return { etiqueta: String(inicio.getFullYear()), inicio, fin };
  });
}

export function dentroDeTramo(fechaIso: string, tramo: Tramo): boolean {
  const fecha = new Date(fechaIso).getTime();
  return fecha >= tramo.inicio.getTime() && fecha < tramo.fin.getTime();
}

/** Ventanas móviles de los listados: hoy, últimos 7 / 30 / 365 días o todo. */
export function dentroDePeriodo(fechaIso: string, periodo: PeriodoLista, hoy: Date): boolean {
  if (periodo === "todo") return true;
  const fecha = new Date(fechaIso);
  if (periodo === "dia") {
    return (
      fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth() && fecha.getDate() === hoy.getDate()
    );
  }
  const dias = periodo === "semana" ? 7 : periodo === "mes" ? 30 : 365;
  const desde = inicioDelDia(hoy);
  desde.setDate(desde.getDate() - dias);
  return fecha >= desde;
}
