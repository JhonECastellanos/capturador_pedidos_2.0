import { Navigate, useNavigate } from "react-router-dom";
import { IconPackage, IconUser } from "../../components/Icons";
import { perfilesDemostracion, useAuth } from "../../context/AuthContext";

export default function Acceso() {
  const navegar = useNavigate();
  const { usuario, iniciarSesion } = useAuth();

  if (usuario) return <Navigate to={usuario.rol === "administrador" ? "/administracion" : "/vendedor"} replace />;

  function seleccionarPerfil(rol: "administrador" | "vendedor") {
    iniciarSesion(rol);
    navegar(rol === "administrador" ? "/administracion" : "/vendedor");
  }

  return (
    <div className="flex min-h-full flex-col bg-paper px-5 pb-8 pt-[max(2rem,env(safe-area-inset-top))] md:px-6">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-accent"><IconPackage width={28} height={28} /></div>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Capturador de pedidos</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink">¿Cómo vas a ingresar?</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">Selecciona un perfil de demostración para recorrer la aplicación.</p>

        <div className="mt-6 grid gap-3">
          {perfilesDemostracion.map((perfil) => (
            <button key={perfil.rol} type="button" onClick={() => seleccionarPerfil(perfil.rol)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${perfil.rol === "administrador" ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink"}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${perfil.rol === "administrador" ? "bg-accent text-ink" : "bg-teal-soft text-teal"}`}><IconUser width={21} height={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-[16px] font-semibold">{perfil.rol === "administrador" ? "Administrador" : "Vendedor"}</span><span className={`mt-0.5 block text-[12px] ${perfil.rol === "administrador" ? "text-white/65" : "text-ink-soft"}`}>{perfil.rol === "administrador" ? "Control total, inventario y cierre" : "Clientes, pedidos y cobros"}</span></span>
              <span className={`text-[11px] font-medium ${perfil.rol === "administrador" ? "text-accent" : "text-teal"}`}>Abrir</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
