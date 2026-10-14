/**
 * Punto de entrada del contrato compartido de Synchronic.JO.
 *
 * Se importa igual desde el frontend y desde la API:
 *   import { ESTADO_PEDIDO, type PedidoDTO } from "@synchronic-jo/contrato";
 */

export * from "./enums";
export * from "./tipos";
export * from "./esquemas";
export * from "./sincronizacion";
export * from "./conteo-diario";

/** Versión del contrato. Súbela cuando cambie la forma de la API. */
export const VERSION_CONTRATO = "1.0.0";

export * from "./conteo-compartido";
export * from "./agentes";

export * from "./apariencia";
