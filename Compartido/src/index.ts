/**
 * Punto de entrada del contrato compartido de AMBIÉ.
 *
 * Se importa igual desde el frontend y desde la API:
 *   import { ESTADO_PEDIDO, type PedidoDTO } from "@ambie/contrato";
 */

export * from "./enums";
export * from "./tipos";
export * from "./esquemas";
export * from "./sincronizacion";
export * from "./conteo-diario";

/** Versión del contrato. Súbela cuando cambie la forma de la API. */
export const VERSION_CONTRATO = "1.0.0";
