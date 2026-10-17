import { useApariencia } from "../../context/apariencia-context";
import { InstalarAplicacion } from "../../components/InstalarAplicacion";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { APP_VERSION, APP_NOMBRE } from "../../config";
import { useAuth } from "../../context/auth";
import { usaApi } from "../../data/api";

export default function Acceso({ operador = false }: { operador?: boolean }) {
  const { apariencia } = useApariencia();
  const navegar = useNavigate();
  const { usuario, cargando, iniciarSesionConCredenciales } = useAuth();
  const [entrando, setEntrando] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destino = (u: NonNullable<typeof usuario>) => operador && u.esSistema ? "/operador" : u.rol === "administrador" ? "/admin" : u.rol === "inventario" ? "/inventario" : "/vendedor";
  if (usuario) {
    if (operador && !usuario.esSistema) return <div className="p-5"><p role="alert">Tu sesión pertenece al negocio. El panel de mando requiere la cuenta técnica system.</p><button type="button" className="mt-3 underline" onClick={() => navegar("/")}>Abrir mi negocio</button></div>;
    return <Navigate to={destino(usuario)} replace />;
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (entrando) return;
    setEntrando(true);
    const res = await iniciarSesionConCredenciales(identificador, password);
    setEntrando(false);
    if (!res.ok) {
      setError(res.error ?? "Error al iniciar sesión");
      return;
    }
    // Redirección según el rol del usuario autenticado:
    // administrador → /admin, vendedor → /vendedor
    if (res.usuario) navegar(operador ? "/operador" : destino(res.usuario), { replace: true });
  }

  return (
    <div className="acceso-negocio flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-paper px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] md:px-6">
      {/* Los márgenes automáticos centran solo cuando sobra espacio: en ventanas
          bajas el contenido empieza arriba y permanece accesible por scroll. */}
      <div className="mx-auto my-auto flex w-full max-w-sm shrink-0 flex-col">
        {!operador && <div className="mb-5 overflow-hidden rounded-2xl border border-line bg-paper-raised">
          <img src={apariencia.imagen || `/portadas/${apariencia.portada}.svg`} alt="Bienvenido a tu negocio" className="h-36 w-full object-cover sm:h-44" />
          <p className="px-4 py-3 text-sm font-semibold">Tu negocio. Tus agentes. ABI contigo.</p>
        </div>}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-accent"><img src={`${operador ? "/operador" : ""}/assets/branding/simbolo.svg`} alt="" width="44" height="44" /></div>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{APP_NOMBRE}</p>
        <p className="mt-1 font-mono text-[10px] text-ink-faint">{APP_VERSION}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink">{operador ? "Panel de mando" : "Iniciar sesión"}</h1>
        {operador && <p className="mt-2 text-sm text-ink-soft">Acceso del operador con system y su contraseña actual. Administra empresas conectadas, workflows y oferta comercial.</p>}

        <form onSubmit={handleLogin} className="mt-6 rounded-2xl border border-line bg-paper-raised p-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="usuario-acceso" className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Usuario o correo</label>
              <input
                id="usuario-acceso"
                required
                value={identificador}
                onChange={(e) => { setIdentificador(e.target.value); setError(null); }}
                placeholder={operador ? "system" : "Tu correo o código de usuario"}
                autoComplete="username"
                className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password-acceso" className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Contraseña</label>
              <div className="relative mt-1.5">
                <input
                  id="password-acceso"
                  required
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
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p>}
            <button type="submit" disabled={entrando || cargando} className="w-full rounded-xl bg-ink py-3 text-[14px] font-semibold text-white active:bg-ink/90 disabled:opacity-50">{entrando ? "Ingresando…" : cargando ? "Restaurando sesión…" : "Ingresar"}</button>
          </div>
        </form>

        {/* ─── Acceso rápido con credenciales del README ─── */}
        {!usaApi && <div className="mt-5 rounded-2xl border border-line bg-paper-raised p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Usuarios oficiales (toca para rellenar)
          </p>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setIdentificador("admin@abinova.local");
                setPassword("admin123");
                setError(null);
              }}
              className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-left active:bg-paper-sunken"
            >
              <div>
                <p className="text-[13px] font-semibold text-ink">Administrador</p>
                <p className="font-mono text-[11.5px] text-ink-soft">admin@abinova.local · admin123</p>
              </div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">
                Usar
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIdentificador("vendedor@abinova.local");
                setPassword("vendedor123");
                setError(null);
              }}
              className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-left active:bg-paper-sunken"
            >
              <div>
                <p className="text-[13px] font-semibold text-ink">Vendedor</p>
                <p className="font-mono text-[11.5px] text-ink-soft">vendedor@abinova.local · vendedor123</p>
              </div>
              <span className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-semibold text-teal">
                Usar
              </span>
            </button>
          </div>
        </div>}
        {!operador && <div className="mt-4"><InstalarAplicacion /></div>}
        {usaApi && <p className="mt-4 text-sm text-ink-soft">Usa el acceso asignado por tu administrador. Los datos se comparten entre los dispositivos del negocio.</p>}
      </div>
    </div>
  );
}
