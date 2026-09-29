import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generarToken(): string {
  return randomBytes(32).toString("hex");
}

export function tz(): string {
  return process.env.APP_TIMEZONE ?? "America/Bogota";
}

/** Fecha operativa local (hoy en la zona del negocio) como Date de medianoche. */
export function hoyLocal(): Date {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const mapa: Record<string, string> = {};
  for (const p of partes) mapa[p.type] = p.value;
  return new Date(`${mapa.year}-${mapa.month}-${mapa.day}T00:00:00.000Z`);
}

/** Date a `YYYY-MM-DD` usando la zona del negocio. */
export function fechaLocalISO(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

export function ahoraISO(): string {
  return new Date().toISOString();
}
