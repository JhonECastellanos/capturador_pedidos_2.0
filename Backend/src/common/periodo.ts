import { z } from "zod";
import { hoyLocal } from "./crypto";

/** Las listas usan ventanas de calendario de Bogotá, con las mismas fechas que la interfaz. */
export function rangoPeriodo(periodo?: string, contable = false) {
  const valor = z.enum(["hoy", "ayer", "semana", "mes", "anio", "todo"]).parse(periodo || "todo");
  if (valor === "todo") return undefined;
  const hoy = hoyLocal().getTime();
  const dias = valor === "hoy" ? 0 : valor === "ayer" ? 1 : valor === "semana" ? 7 : valor === "mes" ? 30 : 365;
  const desfase = contable ? 0 : 5 * 3600000;
  return { gte: new Date(hoy - dias * 86400000 + desfase), ...(valor === "hoy" || valor === "ayer" ? { lt: new Date(hoy + (valor === "hoy" ? 1 : 0) * 86400000 + desfase) } : {}) };
}
