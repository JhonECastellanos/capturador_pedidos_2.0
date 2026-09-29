import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

/**
 * Configuración del CLI: dónde está la API y con qué proveedor se habla.
 *
 * Se guarda en el hogar del usuario y no en el repositorio, porque contiene
 * claves. El archivo se crea con permisos solo para el dueño (0600) en Linux
 * y macOS; en Windows el permiso lo controla el propio usuario del sistema.
 */

export interface ConfigCLI {
  apiUrl: string;
  proveedor: string;
  modelo: string;
  /** Alias de la clave guardada, para no escribirla cada vez. */
  claves: Record<string, string>;
  usuario?: { email: string; token?: string; refresh?: string };
}

const RUTA_POR_DEFECTO = () => join(homedir(), ".ambie", "cli.json");

export const RUTA_CONFIG = process.env.AMBIE_CONFIG ?? RUTA_POR_DEFECTO();

export function configVacia(): ConfigCLI {
  return {
    apiUrl: process.env.API_URL ?? "http://localhost:3000",
    proveedor: process.env.IA_PROVEEDOR ?? "gemini",
    modelo: process.env.IA_MODELO ?? "",
    claves: {},
  };
}

export function leerConfig(): ConfigCLI {
  if (!existsSync(RUTA_CONFIG)) return configVacia();
  try {
    const crudo = JSON.parse(readFileSync(RUTA_CONFIG, "utf8")) as Partial<ConfigCLI>;
    return { ...configVacia(), ...crudo, claves: crudo.claves ?? {} };
  } catch {
    // Una config corrupta no debe impedir usar el CLI: se arranca de cero.
    return configVacia();
  }
}

export function guardarConfig(config: ConfigCLI): void {
  mkdirSync(dirname(RUTA_CONFIG), { recursive: true });
  writeFileSync(RUTA_CONFIG, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(RUTA_CONFIG, 0o600);
  } catch {
    // En Windows el modo POSIX no aplica y no es un error.
  }
}

/** Oculta la clave al mostrarla: deja ver el principio y el final. */
export function ocultar(secreto: string): string {
  if (secreto.length <= 10) return "•".repeat(secreto.length);
  return `${secreto.slice(0, 5)}…${secreto.slice(-4)}`;
}
