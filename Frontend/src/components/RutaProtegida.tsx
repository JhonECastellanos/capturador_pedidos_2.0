import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import type { RolUsuario } from "../types";

interface RutaProtegidaProps { children: ReactNode; roles?: RolUsuario[]; }

export function RutaProtegida({ children, roles }: RutaProtegidaProps) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p role="status" className="p-6 text-ink-soft">Restaurando sesión…</p>;
  if (!usuario) return <Navigate to="/" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to={usuario.rol === "administrador" ? "/admin" : "/vendedor"} replace />;
  return <>{children}</>;
}
