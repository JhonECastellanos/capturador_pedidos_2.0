/**
 * Acceso al almacenamiento local con claves versionadas.
 * Cambiar la versión aquí permite migraciones de datos futuras.
 */

const PREFIJO = "ambie:v1:";

export function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (crudo === null) return porDefecto;
    return JSON.parse(crudo) as T;
  } catch {
    return porDefecto;
  }
}

export function guardar<T>(clave: string, valor: T): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // Cuota llena: la app sigue funcionando en memoria durante la sesión.
  }
}

/** Elimina todos los datos del negocio (reset de demostración). */
export function limpiarTodo(): void {
  const claves: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const clave = localStorage.key(i);
    if (clave?.startsWith(PREFIJO)) claves.push(clave);
  }
  claves.forEach((clave) => localStorage.removeItem(clave));
}

/** Genera identificadores únicos. */
export function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
