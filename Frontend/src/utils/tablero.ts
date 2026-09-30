import type { DashboardResumenDTO } from "@ambie/contrato";
import type { Tramo } from "./periodos";
/** Día local de la interfaz, sin desplazar el DATE contable a UTC. */
export function diaTablero(fecha: Date) { return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`; }
export function rangoTramos(tramos: Tramo[]) {
  const fin = new Date(tramos[tramos.length - 1].fin);
  fin.setDate(fin.getDate() - 1);
  return [diaTablero(tramos[0].inicio), diaTablero(fin)] as const;
}
/** Agrupa como máximo 2001 agregados diarios, nunca los pedidos del negocio. */
export function serieTablero(data: DashboardResumenDTO | undefined, tramos: Tramo[]) {
  return tramos.map((tramo) => {
    const inicio = diaTablero(tramo.inicio), fin = diaTablero(tramo.fin);
    const filas = data?.serie.filter((f) => f.dia >= inicio && f.dia < fin) ?? [];
    return { etiqueta: tramo.etiqueta, ventas: filas.reduce((s, f) => s + f.ventas, 0), egresos: filas.reduce((s, f) => s + f.compras + f.gastos, 0), rentabilidad: filas.reduce((s, f) => s + f.ventas - f.costo - f.gastos, 0) };
  });
}
