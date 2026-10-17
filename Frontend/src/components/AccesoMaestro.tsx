import { useAuth } from "../context/auth";

/** El acceso técnico conserva su identidad al revisar las pantallas de cada rol. */
export function AccesoMaestro() {
  const { usuario } = useAuth();
  if (!usuario?.esSistema) return null;
  return <aside aria-label="Acceso maestro" className="relative z-40 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-paper-raised px-2 py-1 text-[11px] text-ink-soft">
    <strong>Maestro · Las operaciones se registran como pruebas</strong>
    <a className="underline" href="/operador/">Control</a><a className="underline" href="/admin">Administrador</a><a className="underline" href="/vendedor">Vendedor</a><a className="underline" href="/inventario">Inventario</a>
  </aside>;
}
