import { permisoPantalla } from "../utils/apariencia";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
import type { RolUsuario } from "../types";

interface RutaProtegidaProps { children: ReactNode; roles?: RolUsuario[]; }

export function RutaProtegida({ children, roles }: RutaProtegidaProps) {
  const { pathname } = useLocation();
  const { usuario, cargando } = useAuth();
  if (cargando) return <p role="status" className="p-6 text-ink-soft">Restaurando sesión…</p>;
  if (!usuario) return <Navigate to="/" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to={usuario.rol === "administrador" ? "/admin" : usuario.rol === "inventario" ? "/inventario" : "/vendedor"} replace />;
  if (usuario.permisosDenegados?.includes(permisoPantalla(pathname) ?? "")) return <p role="status" className="p-5 text-ink-soft">Tu administrador deshabilitó este acceso. Puedes continuar en los módulos habilitados.</p>;
  return <>{children}</>;
}
