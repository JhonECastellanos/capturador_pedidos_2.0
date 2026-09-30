import { PaginacionEsquema } from "@ambie/contrato";

/** Traduce una sola vez los parámetros HTTP al nombre interno del contrato. */
export function paginacion(page?: string, pageSize?: string) {
  const datos = PaginacionEsquema.parse({ page, pageSize });
  return { pagina: datos.page, porPagina: datos.pageSize };
}
