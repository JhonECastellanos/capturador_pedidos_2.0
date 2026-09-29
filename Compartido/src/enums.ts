/**
 * Enums canónicos de AMBIÉ.
 *
 * Cada valor coincide exactamente con el `@map(...)` del enum en
 * `Backend/prisma/schema.prisma` y con el texto que viaja por la API.
 *
 * Si cambias un valor aquí, debes cambiarlo también en el enum de Prisma.
 * El script `npm run contrato:verificar` falla si se desincronizan.
 */

// ─── Identidad y permisos ─────────────────────────────────────────

export const ROL_USUARIO = ["administrador", "vendedor"] as const;
export type RolUsuario = (typeof ROL_USUARIO)[number];

export const PERMISOS = [
  "pedidos",
  "inventario",
  "caja",
  "usuarios",
  "cierre-diario",
  "clientes",
  "cobros",
] as const;
export type Permiso = (typeof PERMISOS)[number];

// ─── Pagos y cartera ──────────────────────────────────────────────

/** `nequi` se renombró a `billetera` en frontend, API y base de datos. */
export const METODO_PAGO = ["efectivo", "billetera", "credito"] as const;
export type MetodoPago = (typeof METODO_PAGO)[number];

export const MOMENTO_COBRO = ["inmediato", "al-entregar", "segun-periodicidad"] as const;
export type MomentoCobro = (typeof MOMENTO_COBRO)[number];

export const TIPO_PAGO = ["pago-inicial", "abono", "reembolso"] as const;
export type TipoPago = (typeof TIPO_PAGO)[number];

export const ESTADO_PAGO = ["activo", "revertido"] as const;
export type EstadoPago = (typeof ESTADO_PAGO)[number];

/** Derivado: se calcula sumando los abonos aplicados a los pedidos. */
export const ESTADO_CUENTA = ["al-dia", "pendiente"] as const;
export type EstadoCuenta = (typeof ESTADO_CUENTA)[number];

export const TIPO_CREDITO = ["diario", "semanal", "quincenal", "mensual"] as const;
export type TipoCredito = (typeof TIPO_CREDITO)[number];

/** Días de recordatorio por periodicidad pactada. */
export const FRECUENCIA_POR_TIPO_CREDITO: Record<TipoCredito, number> = {
  diario: 1,
  semanal: 7,
  quincenal: 15,
  mensual: 30,
};

export const ETIQUETA_TIPO_CREDITO: Record<TipoCredito, string> = {
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

export function frecuenciaDeTipoCredito(tipo: TipoCredito | null | undefined): number {
  if (!tipo) return 2;
  return FRECUENCIA_POR_TIPO_CREDITO[tipo];
}

// ─── Pedidos ──────────────────────────────────────────────────────

export const ESTADO_PEDIDO = ["pendiente", "en-preparacion", "entregado", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADO_PEDIDO)[number];

/** Transiciones permitidas. Cancelar un pedido entregado no está permitido. */
export const TRANSICIONES_PEDIDO: Record<EstadoPedido, EstadoPedido[]> = {
  pendiente: ["en-preparacion", "entregado", "cancelado"],
  "en-preparacion": ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

/** Estado de pago de un pedido. Derivado del saldo pendiente. */
export const ESTADO_PAGO_PEDIDO = ["pagado", "pendiente"] as const;
export type EstadoPagoPedido = (typeof ESTADO_PAGO_PEDIDO)[number];

// ─── Inventario ───────────────────────────────────────────────────

export const TIPO_MOVIMIENTO_INVENTARIO = [
  "inicializacion",
  "reserva",
  "consumo-pedido",
  "liberacion-reserva",
  "recepcion-compra",
  "ajuste-conteo",
  "ajuste-manual",
  "reversion",
] as const;
export type TipoMovimientoInventario = (typeof TIPO_MOVIMIENTO_INVENTARIO)[number];

export const ESTADO_RESERVA = ["reservada", "consumida", "liberada"] as const;
export type EstadoReserva = (typeof ESTADO_RESERVA)[number];

export const TIPO_CONTEO = ["general", "aleatorio"] as const;
export type TipoConteo = (typeof TIPO_CONTEO)[number];

export const ESTADO_CONTEO = ["en-curso", "confirmado", "cancelado"] as const;
export type EstadoConteo = (typeof ESTADO_CONTEO)[number];

export const MOTIVOS_AJUSTE = [
  "perdida",
  "robo",
  "correccion",
  "reversion-compra",
  "vencimiento",
  "donacion",
  "error-captura",
  "otro",
] as const;
export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number];

// ─── Caja y cierre ────────────────────────────────────────────────

export const TIPO_MOVIMIENTO_CAJA = ["ingreso", "egreso"] as const;
export type TipoMovimientoCaja = (typeof TIPO_MOVIMIENTO_CAJA)[number];

export const ESTADO_FACTURA = ["emitida", "anulada"] as const;
export type EstadoFactura = (typeof ESTADO_FACTURA)[number];

export const ESTADO_CIERRE = ["cerrado", "reabierto"] as const;
export type EstadoCierre = (typeof ESTADO_CIERRE)[number];

/** Medios de pago que se cuentan al cerrar el día. */
export const MEDIOS_CONTEO = ["efectivo", "billetera"] as const;
export type MedioConteo = (typeof MEDIOS_CONTEO)[number];

// ─── Etiquetas visibles ───────────────────────────────────────────
// El valor técnico es `billetera`; la etiqueta se puede cambiar sin
// tocar el código ni la base de datos.

export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  billetera: "Billetera",
  credito: "Crédito",
};

export const ETIQUETA_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  "en-preparacion": "En preparación",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const ETIQUETA_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  "al-dia": "Al día",
  pendiente: "Pendiente",
};

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  administrador: "Administrador",
  vendedor: "Vendedor",
};

export const ETIQUETA_ESTADO_CONTEO: Record<EstadoConteo, string> = {
  "en-curso": "En curso",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
};

// ─── Consecutivos ─────────────────────────────────────────────────
// Globales, sin reinicio anual y sin huecos: si la transacción falla,
// el número no se consume.

export const PREFIJOS_CONSECUTIVOS = {
  cliente: "CLI",
  usuario: "USR",
  producto: "PROD",
  tipoCredito: "TC",
  pedido: "PED",
  recepcion: "REC",
  factura: "FAC",
} as const;

export type TipoConsecutivo = (typeof PREFIJOS_CONSECUTIVOS)[keyof typeof PREFIJOS_CONSECUTIVOS];

// ─── Periodos de filtro ───────────────────────────────────────────

export const PERIODO = ["hoy", "ayer", "semana", "mes", "anio", "todo"] as const;
export type Periodo = (typeof PERIODO)[number];

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Semanal",
  mes: "Mensual",
  anio: "Año",
  todo: "Todo",
};

/** Granularidad del eje temporal de las gráficas. */
export const GRANULARIDAD = ["dia", "semana", "mes", "anio"] as const;
export type Granularidad = (typeof GRANULARIDAD)[number];

export const ETIQUETA_GRANULARIDAD: Record<Granularidad, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
};
