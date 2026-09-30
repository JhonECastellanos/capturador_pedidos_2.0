import { createContext } from "react";
import type { RolUsuario, UsuarioSistema } from "../types";

export interface AuthContextValue {
  usuario: UsuarioSistema | null;
  cargando: boolean;
  iniciarSesion: (rol: RolUsuario) => void;
  iniciarSesionConCredenciales: (identificador: string, password: string) => Promise<{ ok: boolean; error?: string; usuario?: UsuarioSistema }>;
  cerrarSesion: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
