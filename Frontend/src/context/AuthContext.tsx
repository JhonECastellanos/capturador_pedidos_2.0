import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { RolUsuario, UsuarioSistema } from "../modules/clientes-pedido/types";

interface AuthContextValue {
  usuario: UsuarioSistema | null;
  iniciarSesion: (rol: RolUsuario) => void;
  cerrarSesion: () => void;
}

export const perfilesDemostracion = [
  { nombre: "Perfil administrador", rol: "administrador" as const },
  { nombre: "Perfil vendedor", rol: "vendedor" as const },
];

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function usuarioDesdePerfil(perfil: (typeof perfilesDemostracion)[number]): UsuarioSistema {
  const permisosPorRol: Record<RolUsuario, string[]> = {
    administrador: ["pedidos", "inventario", "caja", "usuarios", "cierre-diario"],
    vendedor: ["clientes", "pedidos", "cobros"],
  };
  return {
    id: `usuario-${perfil.rol}`,
    nombre: perfil.nombre,
    email: "",
    rol: perfil.rol,
    permisos: permisosPorRol[perfil.rol],
    activo: true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSistema | null>(null);

  function iniciarSesion(rol: RolUsuario) {
    const perfil = perfilesDemostracion.find((item) => item.rol === rol);
    if (perfil) setUsuario(usuarioDesdePerfil(perfil));
  }

  function cerrarSesion() {
    setUsuario(null);
  }

  const value = useMemo(() => ({ usuario, iniciarSesion, cerrarSesion }), [usuario]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return context;
}
