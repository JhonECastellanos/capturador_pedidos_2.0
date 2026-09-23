import type { UsuarioSistema } from "../types";

/**
 * Catálogo base del sistema: categorías sugeridas y los accesos oficiales.
 * El negocio arranca sin datos: clientes, productos, pedidos, caja y demás
 * se crean desde la interfaz.
 */

export const categorias = ["Bebidas", "Lácteos", "Aseo", "Snacks", "Abarrotes"] as const;

/** Los dos accesos oficiales del sistema: sin ellos no se puede entrar. */
export function semillaUsuarios(): UsuarioSistema[] {
  return [
    { id: "usuario-administrador", nombre: "Perfil administrador", email: "admin@ambie.local", password: "admin123", rol: "administrador", permisos: ["pedidos", "inventario", "caja", "usuarios", "cierre-diario"], activo: true },
    { id: "usuario-vendedor", nombre: "Perfil vendedor", email: "vendedor@ambie.local", password: "vendedor123", rol: "vendedor", permisos: ["clientes", "pedidos", "cobros"], activo: true },
  ];
}

