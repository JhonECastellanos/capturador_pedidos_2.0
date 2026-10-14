import { z } from "zod";

export const ContextoAgenteEsquema = z.object({ conteoId: z.string().uuid(), producto: z.string().trim().min(1).max(150).optional() }).strict();
export type ContextoAgente = z.infer<typeof ContextoAgenteEsquema>;

export const ModosAgente = ["hibrido", "local", "live"] as const;
export const ProveedorAgenteEsquema = z.object({
  id: z.string().uuid(), nombre: z.string().trim().min(1).max(80),
  protocolo: z.enum(["openai", "responses", "gemini", "anthropic", "ollama"]),
  url: z.string().trim().url("Escribe una URL base completa con https://").max(500), modelo: z.string().trim().max(150),
  maxTokens: z.number().int().min(256).max(8192).default(2000),
  apiKey: z.string().trim().max(4096).refine(clave => !/[\r\n]/.test(clave), "La clave debe ir en una sola línea, sin encabezados ni comentarios").optional(), borrarClave: z.boolean().optional(),
}).strict();
export const ConfiguracionAgenteEsquema = z.object({
  habilitado: z.boolean(), modo: z.enum(ModosAgente),
  proveedorId: z.string().uuid().nullable(), respaldoId: z.string().uuid().nullable().default(null),
  proveedores: z.array(ProveedorAgenteEsquema).max(20),
  audio: z.object({ stt: z.enum(["whisper", "moonshine"]), modeloStt: z.string().max(120), idioma: z.string().max(20), voz: z.string().max(150), tts: z.enum(["navegador", "piper"]), velocidad: z.number().min(0.5).max(2), volumen: z.number().min(0).max(1) }).strict(),
  local: z.object({ modelo: z.string().max(150), dispositivo: z.enum(["auto", "cpu", "gpu"]) }).strict(),
  live: z.object({ proveedor: z.enum(["openai", "gemini"]), proveedorId: z.string().uuid().nullable(), modelo: z.string().max(150), voz: z.string().max(80) }).strict(),
}).strict();
export type ConfiguracionAgente = z.infer<typeof ConfiguracionAgenteEsquema>;
export type ConfiguracionAgentePublica = Omit<ConfiguracionAgente, "proveedores"> & {
  version: number;
  proveedores: Array<Omit<ConfiguracionAgente["proveedores"][number], "apiKey" | "borrarClave"> & { tieneClave: boolean }>;
};
export const ConfiguracionAgenteInicial: ConfiguracionAgente = {
  habilitado: false, modo: "hibrido", proveedorId: null, respaldoId: null, proveedores: [],
  audio: { stt: "whisper", modeloStt: "tiny", idioma: "es", tts: "navegador", voz: "", velocidad: 1, volumen: 1 },
  local: { modelo: "", dispositivo: "auto" },
  live: { proveedor: "gemini", proveedorId: null, modelo: "", voz: "" },
};
export const OperacionesAgente = ["pedido", "compra", "gasto", "egreso", "precio", "cobro", "estado", "cierre", "conteo", "iniciar-conteo", "finalizar-conteo", "aplicar-conteo", "consulta"] as const;
export const InstruccionAgenteEsquema = z.object({
  operacion: z.enum(OperacionesAgente),
  recurso: z.enum(["productos", "pedidos", "compras", "proveedores", "resumen"]).optional(),
  busqueda: z.string().max(150).optional(),
  periodo: z.enum(["hoy", "ayer", "semana", "mes", "anio", "todo"]).optional(),
  cliente: z.string().max(150).optional(), ocasional: z.boolean().optional(),
  proveedor: z.string().max(150).optional(), referencia: z.string().max(150).optional(),
  lineas: z.array(z.object({ producto: z.string().min(1).max(150), cantidad: z.number().int().min(0).max(1000000), costoUnitario: z.number().finite().min(0).optional() }).strict()).max(100).optional(),
  metodo: z.enum(["efectivo", "billetera", "credito"]).optional(),
  preparacion: z.enum(["pendiente", "entregado"]).optional(),
  estado: z.enum(["pendiente", "en-preparacion", "entregado", "cancelado"]).optional(),
  concepto: z.string().max(250).optional(), monto: z.number().finite().min(0).optional(),
  precio: z.number().finite().min(0).optional(), producto: z.string().max(150).optional(),
  conteoId: z.string().uuid().optional(), tipoConteo: z.enum(["inicial", "general", "aleatorio"]).optional(),
  cantidad: z.number().int().min(0).optional(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  efectivo: z.number().finite().min(0).optional(), billetera: z.number().finite().min(0).optional(), descontarCaja: z.boolean().optional(),
}).strict();
export type InstruccionAgente = z.infer<typeof InstruccionAgenteEsquema>;
export interface RevisionAgente {
  id: string; version: number; instruccion: InstruccionAgente;
  faltantes: string[]; ruta: string; datos: Record<string, unknown>;
  resumen: string; total?: string; huella: string;
  opcionesProducto?: Array<{ texto: string; elegidoId?: string; opciones: Array<{ id: string; nombre: string }> }>;
  conexion?: { proveedor: string; modelo: string; respaldo: boolean; milisegundos: number; uso?: UsoAgente };
}
export interface EstadoPruebaAgente { estado: "disponible" | "limitado" | "error" | "sin-configurar"; mensaje: string; comprobadoEn: string; milisegundos?: number; uso?: UsoAgente }

/** Validaciones de formato comunes al formulario y al servidor. No consulta la red. */
export function problemaConexionAgente(p: Pick<ConfiguracionAgente["proveedores"][number], "url" | "protocolo">): string | null {
  let url: URL;
  try { url = new URL(p.url); } catch { return "URL base: escribe la dirección completa del proveedor con https://"; }
  if (url.username || url.password || url.search || url.hash) return "URL base: no incluyas claves, parámetros ni fragmentos; la clave va en su propio campo";
  if (p.protocolo !== "ollama" && url.protocol !== "https:") return "URL base: el proveedor externo debe usar https://";
  if (/\/(chat\/completions|responses|messages|models)(\/[^/]+)?\/?$/.test(url.pathname)) return "URL base: quita la ruta de la operación (/models, /chat/completions, /responses o /messages)";
  if (url.hostname === "generativelanguage.googleapis.com" && !url.pathname.includes("/openai") && p.protocolo !== "gemini") return "Protocolo: esta dirección de Google requiere Google Gemini. Elige ese protocolo o agrega nuevamente Google Gemini";
  if (url.hostname === "api.anthropic.com" && p.protocolo !== "anthropic") return "Protocolo: esta dirección requiere Anthropic";
  return null;
}

export interface UsoAgente { entrada?: number; salida?: number; total?: number }
