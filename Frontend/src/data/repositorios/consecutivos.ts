import { leer, guardar } from "./almacenamiento";

/**
 * Consecutivos persistentes por prefijo (PED-0001, REC-0001…).
 * Reemplaza los números aleatorios que podían colisionar.
 */
export function siguienteConsecutivo(prefijo: string): string {
  const clave = `consecutivo:${prefijo}`;
  const actual = leer<number>(clave, 0);
  const siguiente = actual + 1;
  guardar(clave, siguiente);
  return `${prefijo}-${String(siguiente).padStart(4, "0")}`;
}
