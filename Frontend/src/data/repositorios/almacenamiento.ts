/**
 * Acceso al almacenamiento local con claves versionadas.
 *
 * v2 aísla los datos de la versión v1 que todavía podían quedar en el
 * navegador de otra sesión. Así una instalación validada siempre comienza
 * limpia sin mostrar datos antiguos en el panel.
 */

const PREFIJO = "ambie:v2:";
const PREFIJOS_LEGADOS = ["ambie:v1:"];

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

/** Elimina los datos de negocio de la versión actual y de la legacy. */
export function limpiarTodo(): void {
  const claves: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const clave = localStorage.key(i);
    if (clave && [PREFIJO, ...PREFIJOS_LEGADOS].some((prefijo) => clave.startsWith(prefijo))) claves.push(clave);
  }
  claves.forEach((clave) => localStorage.removeItem(clave));
}

/** Genera identificadores únicos. */
export function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
