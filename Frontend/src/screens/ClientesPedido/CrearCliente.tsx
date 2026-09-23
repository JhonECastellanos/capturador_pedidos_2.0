import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BarraInferior } from "../../components/BarraInferior";
import { BarraSuperior } from "../../components/BarraSuperior";
import { Boton } from "../../components/Boton";
import { IconUser } from "../../components/Icons";
import { useOperaciones } from "../../context/OperacionesContext";

const campoBase = "mt-1.5 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none";

export default function CrearCliente() {
  const navegar = useNavigate();
  const { crearCliente } = useOperaciones();
  const [formulario, setFormulario] = useState({ nombre: "", alias: "", identificacion: "", telefono: "", ciudad: "Bogotá", direccion: "" });

  function actualizar(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function guardarCliente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cliente = crearCliente(formulario);
    navegar("/vendedor/pedido", { state: { clienteId: cliente.id } });
  }

  const formularioValido = formulario.nombre.trim().length > 1 && formulario.alias.trim().length > 1;

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior titulo="Crear cliente" subtitulo="Paso 1 · Alta rápida" onVolver={() => navegar("/vendedor")} paso={{ actual: 1, total: 3 }} />
      <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6">
        <div className="rounded-xl border border-teal/20 bg-teal-soft p-4"><div className="flex items-start gap-3"><IconUser width={20} height={20} className="mt-0.5 flex-shrink-0 text-teal" /><div><p className="text-[14px] font-semibold text-ink">Identificación natural</p><p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">El alias te ayuda a encontrar al cliente en el mostrador. Ejemplo: “Jaimito el de los pantalones”.</p></div></div></div>
        <form id="formulario-cliente" onSubmit={guardarCliente} className="mt-5 space-y-4">
          <label className="block text-[12.5px] font-semibold text-ink">Nombre o razón social *<input className={campoBase} value={formulario.nombre} onChange={(e) => actualizar("nombre", e.target.value)} placeholder="Ej. Tienda El Progreso" autoFocus /></label>
          <label className="block text-[12.5px] font-semibold text-ink">Alias / identificador personalizado *<input className={`${campoBase} border-accent`} value={formulario.alias} onChange={(e) => actualizar("alias", e.target.value)} placeholder="Ej. Jaimito el de los pantalones" /><span className="mt-1 block text-[11.5px] font-normal text-ink-faint">Así lo reconocerás rápidamente dentro del negocio.</span></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-[12.5px] font-semibold text-ink">Identificación<input className={campoBase} value={formulario.identificacion} onChange={(e) => actualizar("identificacion", e.target.value)} placeholder="CC / NIT" /></label><label className="block text-[12.5px] font-semibold text-ink">Teléfono<input className={campoBase} value={formulario.telefono} onChange={(e) => actualizar("telefono", e.target.value)} placeholder="300 000 0000" inputMode="tel" /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="block text-[12.5px] font-semibold text-ink">Ciudad<input className={campoBase} value={formulario.ciudad} onChange={(e) => actualizar("ciudad", e.target.value)} placeholder="Bogotá" /></label><label className="block text-[12.5px] font-semibold text-ink">Dirección<input className={campoBase} value={formulario.direccion} onChange={(e) => actualizar("direccion", e.target.value)} placeholder="Calle / carrera" /></label></div>
        </form>
      </main>
      <BarraInferior><Boton type="submit" form="formulario-cliente" variante="primario" disabled={!formularioValido}>Guardar y crear pedido</Boton></BarraInferior>
    </div>
  );
}
