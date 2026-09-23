import type { UsuarioSistema } from "../../types";
import { semillaUsuarios } from "../semilla";
import { leer, guardar } from "./almacenamiento";

const CLAVE = "usuarios";

export function cargarUsuarios(): UsuarioSistema[] {
  const guardados = leer<UsuarioSistema[] | null>(CLAVE, null);
  const sembrados = semillaUsuarios();
  if (!guardados || !Array.isArray(guardados) || guardados.length === 0) {
    guardar(CLAVE, sembrados);
    return sembrados;
  }

  // Asegurar que los 2 usuarios oficiales del sistema (admin y vendedor)
  // siempre existan con sus correos y contraseñas según el README.
  let modificado = false;
  const lista = [...guardados];

  for (const base of sembrados) {
    const idx = lista.findIndex(
      (u) =>
        u.id === base.id ||
        (u.rol === base.rol && (u.email === base.email || !u.email || u.id.startsWith("usuario-"))),
    );

    if (idx === -1) {
      lista.unshift({ ...base });
      modificado = true;
    } else {
      const u = lista[idx];
      if (
        !u.email ||
        u.email !== base.email ||
        !u.password ||
        u.password !== base.password ||
        !u.activo
      ) {
        lista[idx] = {
          ...u,
          nombre: u.nombre || base.nombre,
          email: base.email,
          password: base.password,
          rol: base.rol,
          activo: true,
        };
        modificado = true;
      }
    }
  }

  if (modificado) {
    guardar(CLAVE, lista);
  }

  return lista;
}

export function guardarUsuarios(usuarios: UsuarioSistema[]): void {
  guardar(CLAVE, usuarios);
}
