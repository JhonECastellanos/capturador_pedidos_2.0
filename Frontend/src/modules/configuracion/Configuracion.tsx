import { PanelApariencia } from "./PanelApariencia";
import { useAccesoComercial } from "../../context/acceso-comercial-context";
import { InstalarAplicacion } from "../../components/InstalarAplicacion";
import { Link } from "react-router-dom";
import { PanelAgentes } from "../agentes/PanelAgentes";
import { GuiaAyuda } from "../../components/GuiaAyuda";

export function Configuracion() {
  const { tieneModulo } = useAccesoComercial();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="cabecera-modulo flex-shrink-0">
        <h1 className="titulo-modulo sr-only">Configuración</h1>
        <GuiaAyuda pantalla="Configuración" pasos={[{ titulo: "Ajustes del negocio", texto: "Administra usuarios y consulta la auditoría desde los accesos generales. Personaliza colores, fuente y portada en Apariencia; revisa la conexión y el audio del asistente en su panel." }]} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
        <section className="rounded-2xl border border-line bg-paper-raised p-5">
          <h2 className="text-base font-semibold text-ink">Configuración general</h2>
          <p className="mt-2 text-sm text-ink-soft">Administra los accesos y consulta los cambios registrados en el negocio.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {tieneModulo("usuarios") && <Link to="/admin/usuarios" className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink">Administrar usuarios</Link>}
            {tieneModulo("auditoria") && <Link to="/admin/auditoria" className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink">Consultar auditoría</Link>}
          </div>
        </section>
        <PanelApariencia />
        <div className="mt-4"><InstalarAplicacion /></div>
        {tieneModulo("agentes") && <PanelAgentes />}
      </main>
    </div>
  );
}
