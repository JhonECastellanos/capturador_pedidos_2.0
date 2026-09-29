/**
 * Catálogo de proveedores de IA que puede usar el CLI.
 *
 * Cada adaptador habla un dialecto distinto, pero todos se reducen a la misma
 * interfaz `ProveedorIA`: enviar un historial con herramientas y recibir
 * texto o llamadas a herramientas.
 *
 * La idea es que añadir un proveedor nuevo sea escribir un archivo, no tocar
 * el bucle de conversación.
 */

export type RolMensaje = "usuario" | "asistente" | "sistema" | "herramienta";

/** Una herramienta que el modelo puede pedir ejecutar. */
export interface DeclaracionHerramienta {
  nombre: string;
  descripcion: string;
  /** Esquema JSON de los argumentos, tal como lo espera la API del proveedor. */
  parametros: Record<string, unknown>;
}

export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  argumentos: Record<string, unknown>;
}

export interface MensajeHerramienta extends LlamadaHerramienta {
  contenido: string;
  llamada: LlamadaHerramienta;
}

export interface Mensaje {
  rol: RolMensaje;
  contenido: string;
  /** Presente cuando el asistente pidió ejecutar una herramienta. */
  llamadas?: LlamadaHerramienta[];
  /** Presente en un mensaje de rol `herramienta`. */
  herramienta?: MensajeHerramienta;
}

/** Lo que devuelve un proveedor: texto, herramientas a ejecutar, o ambas. */
export interface RespuestaIA {
  texto?: string;
  llamadas: LlamadaHerramienta[];
  /** El proveedor reporta consumo de tokens, si su API los expone. */
  uso?: { entrada?: number; salida?: number; total?: number };
  crudo?: unknown;
}

export interface OpcionesLlamada {
  temperatura?: number;
  maxTokens?: number;
  abortar?: AbortSignal;
}

/** Interfaz común de todos los proveedores. */
export interface ProveedorIA {
  /** Identificador corto para citarlo en la línea de comandos: `gemini`, `groq`… */
  readonly id: string;
  readonly nombre: string;
  /** Si necesita clave de API y de dónde la saca. */
  readonly claveDesde?: string;
  /** Si funciona sin clave (por ejemplo, un modelo local). */
  readonly sinClave?: boolean;
  chat(modelo: string, mensajes: Mensaje[], herramientas: DeclaracionHerramienta[], opciones?: OpcionesLlamada): Promise<RespuestaIA>;
  /** Comprueba que la clave sirve, sin gastar tokens. */
  verificar(clave: string): Promise<{ ok: boolean; detalle: string; modeloSugerido?: string }>;
  /** Modelos que este proveedor recomienda, para no tener que sabérselos de memoria. */
  readonly modelosSugeridos: string[];
}

export class ErrorIA extends Error {
  constructor(
    message: string,
    readonly estado?: number,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = "ErrorIA";
  }
}
