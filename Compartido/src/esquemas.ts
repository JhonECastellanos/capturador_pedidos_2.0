/**
 * Esquemas Zod compartidos.
 *
 * La API los usa para validar cada entrada; el frontend y el CLI los
 * reutilizan para tipar formularios y argumentos sin duplicar reglas.
 */

import { z } from "zod";
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
  password: z.string().min(6, "Mínimo 6 caracteres"),
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
  clienteId: z.string().min(1),
  vendedorId: z.string().optional(),
  lineas: z.array(LineaPedidoEsquema).min(1, "Agrega al menos un producto"),
  metodo: z.enum(METODO_PAGO),
  estadoInicial: z.enum(["pendiente", "entregado"]).optional(),
  momentoCobro: z.enum(MOMENTO_COBRO).optional(),
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
