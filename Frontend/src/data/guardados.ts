const prefijo = "ambie:guardado-pendiente:";
const pendientes = new Map<string, string>();
const recursos = new Set(["clientes", "productos", "pedidos", "abonos", "proveedores", "recepciones-compra", "gastos", "caja", "inventario", "cierres"]);

/** Guarda solo huella y UUID en esta pestaña, nunca formularios ni respuestas. */
export async function claveGuardado(ruta: string, metodo: string, datos: unknown) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(metodo) || !recursos.has(ruta.split("/")[1])) return null;
  const firma = JSON.stringify([metodo, ruta, datos ?? null]);
  const digest = globalThis.crypto.subtle ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(firma)) : null;
  const indice = prefijo + (digest ? Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("") : firma);
  let clave = pendientes.get(indice);
  if (digest) { try { clave ??= sessionStorage.getItem(indice) ?? undefined; } catch { /* La protección continúa en memoria. */ } }
  if (!clave) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    clave = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("").replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/, "$1-$2-$3-$4-$5");
    pendientes.set(indice, clave);
    if (digest) { try { sessionStorage.setItem(indice, clave); } catch { /* Sin almacenamiento, se conserva durante esta sesión. */ } }
  }
  return { indice, clave };
}

export function resolverGuardado(guardado: { indice: string; clave: string } | null) {
  if (!guardado) return;
  pendientes.delete(guardado.indice);
  try { sessionStorage.removeItem(guardado.indice); } catch { /* Almacenamiento no disponible. */ }
}

export function limpiarGuardados() {
  pendientes.clear();
  try { Object.keys(sessionStorage).filter((k) => k.startsWith(prefijo)).forEach((k) => sessionStorage.removeItem(k)); } catch { /* Almacenamiento no disponible. */ }
}
