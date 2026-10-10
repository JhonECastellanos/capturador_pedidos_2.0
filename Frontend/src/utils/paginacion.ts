/**
 * Utilidades de paginación (separadas del componente para no romper
 * Fast Refresh: un archivo que exporta un componente no debe exportar
 * también constantes ni funciones).
 */
import { useSyncExternalStore } from "react";

export const POR_PAGINA = 15;
const escritorio = "(min-width: 1024px) and (pointer: fine)";
function suscribirTamano(actualizar: () => void) {
  const media = window.matchMedia(escritorio);
  media.addEventListener("change", actualizar);
  return () => media.removeEventListener("change", actualizar);
}
export function useTamanoPagina() {
  return useSyncExternalStore(suscribirTamano, () => window.matchMedia(escritorio).matches ? 15 : 5, () => 15);
}

export function paginar<T>(
  lista: T[],
  pagina: number,
  porPagina: number = POR_PAGINA,
): { items: T[]; totalPaginas: number; inicio: number; fin: number } {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (actual - 1) * porPagina;
  const items = lista.slice(inicio, inicio + porPagina);
  return { items, totalPaginas, inicio: lista.length === 0 ? 0 : inicio + 1, fin: inicio + items.length };
}
export function totalPaginasDe(total: number, porPagina: number = POR_PAGINA): number {
  return Math.max(1, Math.ceil(total / porPagina));
}
