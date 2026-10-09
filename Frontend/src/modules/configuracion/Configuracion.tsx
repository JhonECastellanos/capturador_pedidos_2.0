import { Link } from "react-router-dom";

export function Configuracion() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex-shrink-0 border-b border-line px-5 py-4 md:px-6">
        <h1 className="font-display text-xl font-semibold text-ink">Configuración</h1>
        <p className="mt-1 text-sm text-ink-soft">Organiza los ajustes y accesos de tu negocio.</p>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
        <section className="rounded-2xl border border-line bg-paper-raised p-5">
          <h2 className="text-base font-semibold text-ink">Configuración general</h2>
          <p className="mt-2 text-sm text-ink-soft">Administra los accesos y consulta los cambios registrados en el negocio.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/admin/usuarios" className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink">Administrar usuarios</Link>
            <Link to="/admin/auditoria" className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink">Consultar auditoría</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
