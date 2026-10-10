import { z } from "zod";

export const ContextoAgenteEsquema = z.object({ conteoId: z.string().uuid(), producto: z.string().trim().min(1).max(150).optional() }).strict();
export type ContextoAgente = z.infer<typeof ContextoAgenteEsquema>;

export const ModosAgente = ["hibrido", "local", "live"] as const;
export const ProveedorAgenteEsquema = z.object({
  id: z.string().uuid(), nombre: z.string().trim().min(1).max(80),
  protocolo: z.enum(["openai", "gemini", "anthropic", "ollama"]),
  url: z.string().url().max(500), modelo: z.string().trim().max(150),
  apiKey: z.string().max(4096).optional(), borrarClave: z.boolean().optional(),
}).strict();
export const ConfiguracionAgenteEsquema = z.object({
  habilitado: z.boolean(), modo: z.enum(ModosAgente),
  proveedorId: z.string().uuid().nullable(),
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
  habilitado: false, modo: "hibrido", proveedorId: null, proveedores: [],
  audio: { stt: "whisper", modeloStt: "tiny", idioma: "es", tts: "navegador", voz: "", velocidad: 1, volumen: 1 },
  local: { modelo: "", dispositivo: "auto" },
  live: { proveedor: "gemini", proveedorId: null, modelo: "", voz: "" },
};
export const OperacionesAgente = ["pedido", "compra", "gasto", "egreso", "precio", "cobro", "estado", "cierre", "conteo", "iniciar-conteo", "finalizar-conteo", "aplicar-conteo"] as const;
export const InstruccionAgenteEsquema = z.object({
  operacion: z.enum(OperacionesAgente),
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
}
export interface EstadoPruebaAgente { estado: "disponible" | "limitado" | "error" | "sin-configurar"; mensaje: string; comprobadoEn: string; milisegundos?: number }
