/**
 * Esquemas Zod compartidos.
 *
 * La API los usa para validar cada entrada; el frontend los
 * reutiliza para tipar formularios sin duplicar reglas.
 */

import { z } from "zod";

export const ImportarProductosEsquema = z.object({
  prepararInicial: z.boolean(),
  productos: z.array(z.object({
    codigoInterno: z.string().trim().max(40).optional(),
    nombre: z.string().trim().min(1).max(200),
    categoria: z.string().trim().max(100).optional(),
    unidad: z.string().trim().max(40).optional(),
    precioVenta: z.number().finite().min(0).max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, "Usa máximo dos decimales"),
    costoActual: z.number().finite().min(0).max(999999999).optional(),
    stock: z.number().int().min(0).max(2147483647).optional(),
    stockMinimo: z.number().int().min(0).max(2147483647).optional(),
  })).min(1).max(200),
});
export type ImportarProductosDTO = z.infer<typeof ImportarProductosEsquema>;

const diaTablero = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((dia) => {
  const fecha = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === dia;
}, "Fecha inválida");
export const FiltrosTableroEsquema = z.object({
  desde: diaTablero.optional(), hasta: diaTablero.optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
  clienteId: z.string().uuid().optional(), vendedorId: z.string().uuid().optional(),
  soloTops: z.enum(["true", "false"]).optional().transform((valor) => valor === "true"),
}).refine((f) => !f.desde || !f.hasta || (f.desde <= f.hasta && (f.soloTops || (Date.parse(f.hasta) - Date.parse(f.desde)) / 86400000 <= 2000)), "Rango inválido o mayor de 2000 días");
import {
  ESTADO_PEDIDO,
  METODO_PAGO,
  MOMENTO_COBRO,
  PERIODO,
  ROL_USUARIO,
  TIPO_CONTEO,
  TIPO_CREDITO,
} from "./enums";

const texto = z.string().trim();
const textoOpcional = texto.optional().transform((v) => (v ? v : undefined));
const monto = z.number().finite();
const cantidad = z.number().int();

export const PaginacionEsquema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

/** Fechas: solo `YYYY-MM-DD` para filtros y cierres. */
export const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD");

/** Marca de tiempo ISO 8601. */
export const instanteISO = z.string().datetime({ offset: true });

export const passwordEsquema = z.string().min(8, "Mínimo 8 caracteres");

// ─── Autenticación ────────────────────────────────────────────────

export const LoginEsquema = z.object({
  identifier: texto.min(1, "Escribe tu usuario o correo"),
  password: z.string().min(1, "Escribe la contraseña"),
});

export const BootstrapEsquema = z.object({
  email: z.string().email(),
  password: passwordEsquema,
});

export const CrearUsuarioEsquema = z.object({
  nombre: texto.min(2, "El nombre es muy corto"),
  email: z.string().email(),
  rol: z.enum(ROL_USUARIO),
  password: passwordEsquema,
});

export const CambiarRolUsuarioEsquema = z.object({ rol: z.enum(ROL_USUARIO) });

export const AdjuntoEsquema = z.object({ nombre: texto.min(1).max(200), dataUrl: z.string().max(7 * 1024 * 1024) });

export const FiltroAuditoriaEsquema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  entidad: texto.optional(),
});

// ─── Clientes ─────────────────────────────────────────────────────

export const NuevoClienteEsquema = z.object({
  nombre: texto.min(2, "El nombre es obligatorio"),
  telefono: texto.min(5, "El teléfono es obligatorio"),
  direccion: texto.min(3, "El sitio o dirección es obligatorio"),
  fechaNacimiento: textoOpcional,
  tipoCredito: z.enum(TIPO_CREDITO).optional(),
  alias: textoOpcional,
  identificacion: textoOpcional,
  ciudad: textoOpcional,
});

export const FiltroClientesEsquema = z.object({
  q: texto.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

// ─── Productos ────────────────────────────────────────────────────

export const NuevoProductoEsquema = z.object({
  nombre: texto.min(2, "El nombre es obligatorio"),
  categoria: texto.optional(),
  unidad: texto.default("unidad"),
  precioVenta: monto.min(0, "El precio no puede ser negativo"),
  costoActual: monto.min(0).default(0),
  stock: cantidad.min(0).default(0),
  stockMinimo: cantidad.min(0).default(0),
});

export const CambiarPrecioEsquema = z.object({
  nuevoPrecio: monto.min(0, "El precio no puede ser negativo"),
});

export const FiltroProductosEsquema = z.object({
  q: texto.optional(),
  categoria: texto.optional(),
  stockEstado: z.enum(["todos", "alerta", "ok"]).default("todos"),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

// ─── Pedidos ──────────────────────────────────────────────────────

export const LineaPedidoEsquema = z.object({
  productoId: z.string().min(1),
  cantidad: cantidad.min(1, "La cantidad debe ser al menos 1"),
});

export const NuevoPedidoEsquema = z.object({
  clienteId: z.string().min(1).nullable().optional(),
  vendedorId: z.string().optional(),
  lineas: z.array(LineaPedidoEsquema).min(1, "Agrega al menos un producto").refine(
    (lineas) => new Set(lineas.map((linea) => linea.productoId)).size === lineas.length,
    "Agrupa las cantidades: un producto no puede repetirse en el pedido",
  ),
  metodo: z.enum(METODO_PAGO),
  estadoInicial: z.enum(["pendiente", "entregado"]).optional(),
  momentoCobro: z.enum(MOMENTO_COBRO).optional(),
}).superRefine((pedido, ctx) => {
  if (!pedido.clienteId && pedido.metodo === "credito") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["metodo"], message: "La venta ocasional no admite crédito" });
  if (!pedido.clienteId && pedido.momentoCobro === "segun-periodicidad") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["momentoCobro"], message: "La venta ocasional no tiene periodicidad de crédito" });
});

export const CambiarEstadoPedidoEsquema = z.object({
  estado: z.enum(ESTADO_PEDIDO),
  comentario: texto.optional(),
});

export const FiltroPedidosEsquema = z.object({
  segmento: z.enum(["hoy", "historial"]).optional(),
  estado: z.enum(["todos", ...ESTADO_PEDIDO]).optional(),
  q: texto.optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

// ─── Pagos y abonos ───────────────────────────────────────────────

export const NuevoAbonoEsquema = z.object({
  monto: monto.positive("El monto debe ser mayor que cero"),
  metodo: z.enum(["efectivo", "billetera"]),
  comentario: texto.optional(),
});

export const CobroPedidoEsquema = z.object({
  /** Si se omite, se cobra el saldo pendiente completo. */
  monto: monto.positive().optional(),
  metodo: z.enum(["efectivo", "billetera"]),
  comentario: texto.optional(),
});

export const FiltroAbonosEsquema = z.object({
  clienteId: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

// ─── Inventario ───────────────────────────────────────────────────

export const IniciarConteoEsquema = z.object({
  tipo: z.enum(TIPO_CONTEO),
  cantidadAleatoria: cantidad.min(1).optional(),
  turno: texto.min(1, "Indica el turno"),
});

export const ContarLineaEsquema = z.object({
  stockFisico: cantidad.min(0, "El stock físico no puede ser negativo"),
  contadoEnEsperado: z.string().datetime().nullable().optional(),
});

export const AjusteManualEsquema = z.object({
  productoId: z.string().min(1),
  stockFisico: cantidad.min(0, "El stock físico no puede ser negativo"),
  motivo: texto.optional(),
  comentario: texto.optional(),
});

// ─── Compras, proveedores y gastos ────────────────────────────────

export const NuevoProveedorEsquema = z.object({
  nombre: texto.min(2, "El nombre es obligatorio"),
  telefono: texto.optional(),
});

export const LineaRecepcionEsquema = z.object({
  productoId: z.string().min(1),
  cantidad: cantidad.min(1),
  costoUnitario: monto.min(0, "El costo no puede ser negativo"),
});

export const NuevaRecepcionEsquema = z.object({
  proveedorId: z.string().min(1),
  lineas: z.array(LineaRecepcionEsquema).min(1, "Agrega al menos un producto"),
  descontarCaja: z.boolean().default(false),
});

export const NuevoGastoEsquema = z.object({
  concepto: texto.min(2, "El concepto es obligatorio"),
  monto: monto.positive("El monto debe ser mayor que cero"),
  metodo: z.enum(["efectivo", "billetera"]).optional(),
});

// ─── Caja ─────────────────────────────────────────────────────────

export const NuevoEgresoEsquema = z.object({
  concepto: texto.min(2, "El concepto es obligatorio"),
  monto: monto.positive("El monto debe ser mayor que cero"),
  metodo: z.enum(["efectivo", "billetera"]).optional(),
});

export const FiltroMovimientosEsquema = z.object({
  tipo: z.enum(["ingreso", "egreso"]).optional(),
  metodo: z.enum(["efectivo", "billetera"]).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

// ─── Cierre del día ───────────────────────────────────────────────

export const CrearCierreEsquema = z.object({
  fecha: fechaISO,
  trasladar: z.array(z.string()).default([]),
  cancelar: z.array(z.string()).default([]),
  conteoEfectivo: monto.min(0).optional(),
  conteoBilletera: monto.min(0).optional(),
});

// ─── Tablero ──────────────────────────────────────────────────────

export const FiltroTableroEsquema = z.object({
  periodo: z.enum(PERIODO).default("hoy"),
  granularidad: z.enum(["dia", "semana", "mes", "anio"]).default("dia"),
});

export type LoginEntrada = z.infer<typeof LoginEsquema>;
export type BootstrapEntrada = z.infer<typeof BootstrapEsquema>;
export type CrearUsuarioEntrada = z.infer<typeof CrearUsuarioEsquema>;
export type NuevoClienteEntrada = z.infer<typeof NuevoClienteEsquema>;
export type NuevoProductoEntrada = z.infer<typeof NuevoProductoEsquema>;
export type NuevoPedidoEntrada = z.infer<typeof NuevoPedidoEsquema>;
export type CambiarEstadoPedidoEntrada = z.infer<typeof CambiarEstadoPedidoEsquema>;
export type NuevoAbonoEntrada = z.infer<typeof NuevoAbonoEsquema>;
export type CobroPedidoEntrada = z.infer<typeof CobroPedidoEsquema>;
export type NuevaRecepcionEntrada = z.infer<typeof NuevaRecepcionEsquema>;
export type NuevoGastoEntrada = z.infer<typeof NuevoGastoEsquema>;
export type CrearCierreEntrada = z.infer<typeof CrearCierreEsquema>;
