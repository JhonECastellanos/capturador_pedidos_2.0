import { permisoPantalla } from "../utils/apariencia";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
import type { RolUsuario } from "../types";
import { moduloPantalla } from "@abinova/contrato";
import { useAccesoComercial } from "../context/acceso-comercial-context";

interface RutaProtegidaProps { children: ReactNode; roles?: RolUsuario[]; soloSistema?: boolean; }

export function RutaProtegida({ children, roles, soloSistema = false }: RutaProtegidaProps) {
  const { pathname } = useLocation();
  const { usuario, cargando } = useAuth();
  const acceso = useAccesoComercial();
  if (cargando) return <p role="status" className="p-6 text-ink-soft">Restaurando sesión…</p>;
  if (!usuario) return <Navigate to={soloSistema ? "/operador/acceso" : "/"} replace />;
  if (soloSistema && !usuario.esSistema) return <div className="p-5"><p role="alert">Este acceso pertenece al operador de ABINOVA.</p><a className="mt-3 inline-block underline" href="/">Volver a mi negocio</a></div>;
  if (!usuario.esSistema && roles && !roles.includes(usuario.rol)) return <Navigate to={usuario.rol === "administrador" ? "/admin" : usuario.rol === "inventario" ? "/inventario" : "/vendedor"} replace />;
  if (!soloSistema && acceso.cargando) return <p role="status" className="p-5">Cargando accesos del negocio…</p>;
  if (!soloSistema && acceso.error) return <div className="p-5"><p role="alert">{acceso.error}</p><button type="button" className="mt-3 underline" onClick={acceso.reintentar}>Reintentar</button></div>;
  const modulo = moduloPantalla(pathname);
  if (!soloSistema && modulo && !acceso.tieneModulo(modulo)) return <div className="p-5"><p role="status">Este módulo no está incluido en el plan de tu negocio.</p><a className="mt-3 inline-block underline" href="/">Volver al inicio</a></div>;
  if (!usuario.esSistema && usuario.permisosDenegados?.includes(permisoPantalla(pathname) ?? "")) return <p role="status" className="p-5 text-ink-soft">Tu administrador deshabilitó este acceso. Puedes continuar en los módulos habilitados.</p>;
  return <>{children}</>;
}
