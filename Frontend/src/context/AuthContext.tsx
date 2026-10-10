import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RolUsuario, UsuarioSistema } from "../types";
import { PERMISOS_POR_ROL } from "../dominio/servicios";
import { cargarUsuarios } from "../data/repositorios/usuarios";
import { guardar, leer } from "../data/repositorios/almacenamiento";
import { AuthContext } from "./auth-context";
import { api, ErrorApi, usaApi } from "../data/api";
import { limpiarConsultas } from "../data/query";

const CLAVE_SESION = "sesion-usuario";

function usuarioDesdeRol(rol: RolUsuario): UsuarioSistema {
  const registrado = cargarUsuarios().find((usuario) => usuario.rol === rol && usuario.activo);
  if (registrado) return registrado;
  return {
    id: `usuario-${rol}`,
    nombre: rol === "administrador" ? "Perfil administrador" : "Perfil vendedor",
    email: rol === "administrador" ? "admin@ambie.local" : "vendedor@ambie.local",
    password: rol === "administrador" ? "admin123" : "vendedor123",
    rol,
    permisos: PERMISOS_POR_ROL[rol],
    activo: true,
  };
}

function restaurarSesion(): UsuarioSistema | null {
  const idGuardado = leer<string | null>(CLAVE_SESION, null);
  if (!idGuardado) return null;
  return cargarUsuarios().find((usuario) => usuario.id === idGuardado && usuario.activo) ?? null;
}

function coincideUsuario(u: UsuarioSistema, idOrEmail: string): boolean {
  const q = idOrEmail.trim().toLowerCase();
  if (!q) return false;

  // 1. Email exacto
  if (u.email && u.email.toLowerCase() === q) return true;

  // 2. Prefijo de email antes del @ (ej: "admin" para "admin@ambie.local")
  const prefijoEmail = u.email ? u.email.split("@")[0].toLowerCase() : "";
  if (prefijoEmail && prefijoEmail === q) return true;

  // 3. ID de usuario
  if (u.id.toLowerCase() === q) return true;
  if (u.id.toLowerCase() === `usuario-${q}`) return true;

  // 4. Nombre de usuario
  if (u.nombre.toLowerCase() === q) return true;
  if (u.nombre.toLowerCase().includes(q)) return true;

  // 5. Rol
  if (u.rol.toLowerCase() === q) return true;
  if (u.rol === "administrador" && (q === "admin" || q === "adm")) return true;
  if (u.rol === "vendedor" && (q === "vend" || q === "ventas")) return true;

  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSistema | null>(() => usaApi ? null : restaurarSesion());
  const [cargando, setCargando] = useState(usaApi);

  useEffect(() => {
    if (!usaApi) return;
    let vigente = true;
    const expirar = () => { limpiarConsultas(); setUsuario(null); };
    window.addEventListener("ambie:sesion-expirada", expirar);
    void api<UsuarioSistema | null>("/auth/me").then((u) => { if (vigente) setUsuario(u); })
      .catch(() => {}).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; window.removeEventListener("ambie:sesion-expirada", expirar); };
  }, []);

  function iniciarSesion(rol: RolUsuario) {
    if (usaApi) return;
    const sesion = usuarioDesdeRol(rol);
    setUsuario(sesion);
    guardar(CLAVE_SESION, sesion.id);
  }

  async function iniciarSesionConCredenciales(identificador: string, password: string): Promise<{ ok: boolean; error?: string; usuario?: UsuarioSistema }> {
    if (usaApi) {
      try {
        const sesion = await api<{ usuario: UsuarioSistema }>("/auth/login", "POST", { identifier: identificador.trim(), password });
        limpiarConsultas();
        setUsuario(sesion.usuario);
        return { ok: true, usuario: sesion.usuario };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No se pudo iniciar sesión" }; }
    }
    const idOrEmail = identificador.trim().toLowerCase();
    if (!idOrEmail || !password) return { ok: false, error: "Ingresa usuario y contraseña" };
    const usuarios = cargarUsuarios();
    const candidato = usuarios.find((u) => coincideUsuario(u, idOrEmail));

    if (!candidato) return { ok: false, error: "Usuario no encontrado" };
    if (!candidato.activo) return { ok: false, error: "Este usuario se encuentra inactivo" };

    // Si el usuario tiene password, debe coincidir (exacto o ignorando espacios en extremos)
    const pass = password.trim();
    if (candidato.password) {
      if (candidato.password !== password && candidato.password !== pass) {
        return { ok: false, error: "Contraseña incorrecta" };
      }
    }

    setUsuario(candidato);
    guardar(CLAVE_SESION, candidato.id);
    return { ok: true, usuario: candidato };
  }

  async function cerrarSesion(): Promise<boolean> {
    if (usaApi) {
      try { await api("/auth/logout", "POST", {}); limpiarConsultas(); setUsuario(null); return true; }
      catch (e) { if (e instanceof ErrorApi && e.status === 401) { limpiarConsultas(); setUsuario(null); return true; } window.alert("No se pudo cerrar la sesión en el servidor. Revisa la conexión e intenta de nuevo."); return false; }
    }
    setUsuario(null);
    guardar(CLAVE_SESION, null);
    return true;
  }

  const value = useMemo(() => ({ usuario, cargando, iniciarSesion, iniciarSesionConCredenciales, cerrarSesion }), [usuario, cargando]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
