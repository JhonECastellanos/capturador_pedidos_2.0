import type { EstadoPedido } from "../types";

export const ETIQUETAS_ESTADO: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  "en-preparacion": "En preparación",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const CLASES_ESTADO: Record<EstadoPedido, string> = {
  pendiente: "bg-paper-sunken text-ink-soft",
  "en-preparacion": "bg-accent-soft text-accent-dark",
  entregado: "bg-success-soft text-success",
  cancelado: "bg-danger-soft text-danger",
};
