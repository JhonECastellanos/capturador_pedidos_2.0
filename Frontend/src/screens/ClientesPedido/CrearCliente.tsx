import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BarraInferior } from "../../components/BarraInferior";
import { BarraSuperior } from "../../components/BarraSuperior";
import { Boton } from "../../components/Boton";
import { IconCalendar, IconUser } from "../../components/Icons";
import { SelectorOpciones } from "../../components/SelectorOpciones";
import { useOperaciones } from "../../context/operaciones";
import type { TipoCredito } from "../../types";
import { ETIQUETA_TIPO_CREDITO, FRECUENCIA_POR_TIPO_CREDITO } from "../../types";

interface CrearClienteProps {
  /** Ruta de la pantalla inicial del rol (botón volver). */
  rutaInicio?: string;
  /** A dónde ir tras guardar (por defecto el inicio del vendedor). */
  rutaTrasGuardar?: string;
}

const campoBase = "mt-1.5 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none";

const tiposCredito: TipoCredito[] = ["diario", "semanal", "quincenal", "mensual"];

export default function CrearCliente({ rutaInicio = "/vendedor", rutaTrasGuardar = "/vendedor" }: CrearClienteProps) {
  const navegar = useNavigate();
  const { crearCliente } = useOperaciones();
  const [formulario, setFormulario] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    fechaNacimiento: "",
  });
  const [tipoCredito, setTipoCredito] = useState<TipoCredito>("semanal");

  function actualizar(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function guardarCliente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cliente = crearCliente({
      nombre: formulario.nombre,
      telefono: formulario.telefono,
      direccion: formulario.direccion,
      fechaNacimiento: formulario.fechaNacimiento || undefined,
      tipoCredito,
    });
    // El flujo se cierra y vuelve al inicio del rol para iniciar el pedido.
    navegar(rutaTrasGuardar, { state: { clienteCreado: cliente.nombre, clienteId: cliente.id }, replace: true });
  }

  const formularioValido =
    formulario.nombre.trim().length > 1 &&
    formulario.telefono.trim().length > 5 &&
    formulario.direccion.trim().length > 2;

  return (
    <div className="flex h-full flex-col min-h-0">
      <BarraSuperior
        titulo="Crear cliente"
        subtitulo="Alta rápida · 5 datos"
        onVolver={() => navegar(rutaInicio)}
      />

      <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-4 md:px-6">
        <div className="rounded-xl border border-teal/20 bg-teal-soft p-3.5">
          <div className="flex items-start gap-2.5">
            <IconUser width={19} height={19} className="mt-0.5 flex-shrink-0 text-teal" />
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Solo lo esencial</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
                Con estos datos podrás reconocerlo, entregarle y recordarle su crédito.
              </p>
            </div>
          </div>
        </div>

        <form id="formulario-cliente" onSubmit={guardarCliente} className="mt-4 space-y-3.5 max-w-lg">
          <label className="block text-[12.5px] font-semibold text-ink">
            Nombre *
            <input
              className={campoBase}
              value={formulario.nombre}
              onChange={(e) => actualizar("nombre", e.target.value)}
              placeholder="Ej. Jaimito el de los pantalones"
              autoFocus
            />
          </label>

          <label className="block text-[12.5px] font-semibold text-ink">
            Teléfono *
            <input
              className={campoBase}
              value={formulario.telefono}
              onChange={(e) => actualizar("telefono", e.target.value)}
              placeholder="300 000 0000"
              inputMode="tel"
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-faint">Se usa para los recordatorios de WhatsApp.</span>
          </label>

          <label className="block text-[12.5px] font-semibold text-ink">
            Sitio / Dirección *
            <input
              className={campoBase}
              value={formulario.direccion}
              onChange={(e) => actualizar("direccion", e.target.value)}
              placeholder="Ej. Local 12 · Calle 45 #12-30"
            />
          </label>

          <label className="block text-[12.5px] font-semibold text-ink">
            Fecha de nacimiento
            <span className="relative mt-1.5 block">
              <IconCalendar width={17} height={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="date"
                className={`${campoBase} mt-0 pl-10`}
                value={formulario.fechaNacimiento}
                onChange={(e) => actualizar("fechaNacimiento", e.target.value)}
              />
            </span>
          </label>

          <div>
            <p className="text-[12.5px] font-semibold text-ink">Tipo de crédito</p>
            <div className="mt-1.5">
              <SelectorOpciones
                columnas={2}
                valor={tipoCredito}
                onChange={setTipoCredito}
                opciones={tiposCredito.map((tipo) => ({
                  valor: tipo,
                  titulo: ETIQUETA_TIPO_CREDITO[tipo],
                  descripcion: `Recordar cada ${FRECUENCIA_POR_TIPO_CREDITO[tipo]} día(s)`,
                }))}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
              Define cada cuántos días se sugiere el recordatorio de pago. Podrás ajustarlo luego en Abonos.
            </p>
          </div>
        </form>
      </main>

      <BarraInferior>
        <Boton type="submit" form="formulario-cliente" variante="primario" disabled={!formularioValido}>
          Guardar cliente
        </Boton>
      </BarraInferior>
    </div>
  );
}
