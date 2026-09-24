import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { APP_VERSION } from "../../config";
import { IconPackage } from "../../components/Icons";
import { useAuth } from "../../context/auth";

export default function Acceso() {
  const navegar = useNavigate();
  const { usuario, iniciarSesionConCredenciales } = useAuth();
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (usuario) return <Navigate to={usuario.rol === "administrador" ? "/admin" : "/vendedor"} replace />;

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    const res = iniciarSesionConCredenciales(identificador, password);
    if (!res.ok) {
      setError(res.error ?? "Error al iniciar sesión");
      return;
    }
    // Redirección según el rol del usuario autenticado:
    // administrador → /admin, vendedor → /vendedor
    if (res.usuario) navegar(res.usuario.rol === "administrador" ? "/admin" : "/vendedor", { replace: true });
  }

  return (
    <div className="flex min-h-full flex-col bg-paper px-5 pb-8 pt-[max(2rem,env(safe-area-inset-top))] md:px-6">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-accent"><IconPackage width={28} height={28} /></div>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Capturador de pedidos</p>
        <p className="mt-1 font-mono text-[10px] text-ink-faint">{APP_VERSION}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink">Iniciar sesión</h1>

        <form onSubmit={handleLogin} className="mt-6 rounded-2xl border border-line bg-paper-raised p-4">
          <div className="space-y-3">
            <div>
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Usuario o correo</label>
              <input
                value={identificador}
                onChange={(e) => { setIdentificador(e.target.value); setError(null); }}
                placeholder="admin@ambie.local o vendedor@ambie.local"
                autoComplete="username"
                className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Contraseña</label>
              <div className="relative mt-1.5">
                <input
                  type={verPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-line bg-paper px-3.5 py-3 pr-12 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[18px] text-ink-soft active:bg-paper-sunken"
                >
                  {verPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p>}
            <button type="submit" className="w-full rounded-xl bg-ink py-3 text-[14px] font-semibold text-white active:bg-ink/90">Ingresar</button>
          </div>
        </form>

        {/* ─── Acceso rápido con credenciales del README ─── */}
        <div className="mt-5 rounded-2xl border border-line bg-paper-raised p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Usuarios oficiales (toca para rellenar)
          </p>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setIdentificador("admin@ambie.local");
                setPassword("admin123");
                setError(null);
              }}
              className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-left active:bg-paper-sunken"
            >
              <div>
                <p className="text-[13px] font-semibold text-ink">Administrador</p>
                <p className="font-mono text-[11.5px] text-ink-soft">admin@ambie.local · admin123</p>
              </div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">
                Usar
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIdentificador("vendedor@ambie.local");
                setPassword("vendedor123");
                setError(null);
              }}
              className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-left active:bg-paper-sunken"
            >
              <div>
                <p className="text-[13px] font-semibold text-ink">Vendedor</p>
                <p className="font-mono text-[11.5px] text-ink-soft">vendedor@ambie.local · vendedor123</p>
              </div>
              <span className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-semibold text-teal">
                Usar
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
