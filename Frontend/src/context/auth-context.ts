import { createContext } from "react";
import type { RolUsuario, UsuarioSistema } from "../types";

export interface AuthContextValue {
  usuario: UsuarioSistema | null;
  iniciarSesion: (rol: RolUsuario) => void;
  iniciarSesionConCredenciales: (identificador: string, password: string) => { ok: boolean; error?: string; usuario?: UsuarioSistema };
  cerrarSesion: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
