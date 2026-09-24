import { useMemo, useState, type FormEvent } from "react";
import { Boton } from "../../../components/Boton";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { IconArrowLeft, IconUser } from "../../../components/Icons";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/operaciones";
import type { NuevoUsuario, UsuarioSistema } from "../../../types";

export function UsuariosAdmin() {
  const { usuarios, crearUsuario, cambiarEstadoUsuario } = useOperaciones();
  const [vista, setVista] = useState<"lista" | "crear">("lista");
  const [pasoCrear, setPasoCrear] = useState<1 | 2>(1);
  const [usuarioNuevo, setUsuarioNuevo] = useState<NuevoUsuario>({ nombre: "", email: "", rol: "vendedor", password: "" });
  const [confirmarEstadoId, setConfirmarEstadoId] = useState<string | null>(null);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  const usuariosOrdenados = useMemo(() =>
    [...usuarios].sort((a, b) => {
      const rolOrden = a.rol === "administrador" ? 0 : 1;
      const bRolOrden = b.rol === "administrador" ? 0 : 1;
      if (rolOrden !== bRolOrden) return rolOrden - bRolOrden;
      return a.nombre.localeCompare(b.nombre);
    }),
    [usuarios]
  );

  function guardarUsuario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    crearUsuario(usuarioNuevo);
    mostrarAviso(`Usuario ${usuarioNuevo.nombre} creado · rol ${usuarioNuevo.rol}`, "exito");
    setUsuarioNuevo({ nombre: "", email: "", rol: "vendedor", password: "" });
    setPasoCrear(1);
    setVista("lista");
  }

  function abrirCrear() {
    setPasoCrear(1);
    setVista("crear");
  }

  if (vista === "crear") {
    const datosValidos = usuarioNuevo.nombre.trim().length > 1 && usuarioNuevo.email.trim().length > 3;
    return (
      <div className="flex h-full flex-col min-h-0">
        <div className="flex-shrink-0 flex items-center justify-between border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (pasoCrear === 2 ? setPasoCrear(1) : setVista("lista"))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper-raised text-ink active:bg-paper-sunken shadow-sm"
              aria-label="Volver"
            >
              <IconArrowLeft width={18} height={18} />
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Gestión de accesos · Paso {pasoCrear} de 2</p>
              <h2 className="font-display text-[17px] font-semibold text-ink">{pasoCrear === 1 ? "Datos del usuario" : "Confirmar acceso"}</h2>
            </div>
          </div>
          <button type="button" onClick={() => setVista("lista")} className="text-[12px] font-semibold text-danger">
            Cancelar
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-3 max-w-lg">
          {pasoCrear === 1 ? (
            <div className="rounded-2xl border border-line bg-paper-raised p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Nombre completo</label>
                  <input
                    required
                    value={usuarioNuevo.nombre}
                    onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, nombre: evento.target.value }))}
                    placeholder="Ej. Laura Gómez"
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Correo electrónico</label>
                  <input
                    required
                    type="email"
                    value={usuarioNuevo.email}
                    onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, email: evento.target.value }))}
                    placeholder="correo@negocio.com"
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Contraseña / PIN</label>
                  <input
                    value={usuarioNuevo.password}
                    onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, password: evento.target.value }))}
                    placeholder="••••••••"
                    type="password"
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Rol asignado</label>
                  <select
                    value={usuarioNuevo.rol}
                    onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, rol: evento.target.value as NuevoUsuario["rol"] }))}
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink focus:border-ink focus:outline-none"
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-ink-faint leading-relaxed">
                El rol vendedor accede a captura de pedidos y clientes. El rol administrador tiene acceso completo al centro de control.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVista("lista")}
                  className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink"
                >
                  Volver
                </button>
                <Boton type="button" disabled={!datosValidos} onClick={() => setPasoCrear(2)}>Revisar →</Boton>
              </div>
            </div>
          ) : (
            <form onSubmit={guardarUsuario} className="rounded-2xl border border-line bg-paper-raised p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Resumen del acceso</p>
              <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                <div className="flex justify-between px-3 py-2.5 text-[13px]"><span className="text-ink-soft">Nombre</span><span className="font-semibold text-ink">{usuarioNuevo.nombre}</span></div>
                <div className="flex justify-between px-3 py-2.5 text-[13px]"><span className="text-ink-soft">Correo</span><span className="font-semibold text-ink">{usuarioNuevo.email}</span></div>
                <div className="flex justify-between px-3 py-2.5 text-[13px]"><span className="text-ink-soft">Rol</span><span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${usuarioNuevo.rol === "administrador" ? "bg-accent-soft text-accent-dark" : "bg-teal-soft text-teal"}`}>{usuarioNuevo.rol}</span></div>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-soft">
                {usuarioNuevo.rol === "administrador" ? "Acceso total: inventario, caja, cierre y usuarios." : "Acceso a clientes, pedidos y cobros del día."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPasoCrear(1)}
                  className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink"
                >
                  ← Editar
                </button>
                <Boton type="submit">Guardar usuario</Boton>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <IconUser className="text-teal" />
          <h2 className="font-display text-[18px] font-semibold text-ink">Usuarios y permisos</h2>
          <GuiaAyuda
            pantalla="Usuarios y permisos"
            pasos={[
              { titulo: "1 · Crear acceso", texto: "Toca '+ Nuevo Usuario' para crear accesos con nombre, correo, rol y contraseña. Solo el administrador gestiona accesos." },
              { titulo: "2 · Roles", texto: "Vendedor: clientes, pedidos y cobros. Administrador: control total, inventario y cierre." },
              { titulo: "3 · Lista", texto: "Revisa activos, roles y permisos en la tabla con scroll interno." },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={abrirCrear}
          className="flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-white active:bg-ink/90 shadow-sm"
        >
          <span>+ Nuevo Usuario</span>
        </button>
      </div>

      <div className="flex-shrink-0 pt-2 text-[12px] text-ink-soft">
        {usuariosOrdenados.length} usuarios registrados en el sistema
      </div>

      {/* Lista con scroll propio */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30 max-w-xl">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Usuarios ({usuariosOrdenados.length})
            </p>
            <span className="text-[11px] text-ink-soft">Admin primero</span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-2.5">
        {usuariosOrdenados.map((item: UsuarioSistema) => (
          <article key={item.id} className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13.5px] font-semibold text-ink">{item.nombre}</p>
                <p className="text-[12px] text-ink-soft">{item.email}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.rol === "administrador" ? "bg-accent-soft text-accent-dark" : "bg-teal-soft text-teal"}`}>
                {item.rol}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-ink-faint">{item.permisos.join(" · ")} · {item.activo ? "activo" : "inactivo"}</p>
              <button
                type="button"
                onClick={() => setConfirmarEstadoId(item.id)}
                className="flex-shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-ink active:bg-paper-sunken"
              >
                {item.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          </article>
        ))}
            </div>
          </div>
        </div>
      </div>

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

      <ConfirmarAccion
        abierto={confirmarEstadoId !== null}
        titulo={usuariosOrdenados.find((u) => u.id === confirmarEstadoId)?.activo ? "Desactivar usuario" : "Activar usuario"}
        mensaje={`${usuariosOrdenados.find((u) => u.id === confirmarEstadoId)?.nombre ?? "El usuario"} ${usuariosOrdenados.find((u) => u.id === confirmarEstadoId)?.activo ? "no podrá iniciar sesión mientras esté inactivo." : "podrá iniciar sesión de nuevo."}`}
        textoConfirmar="Sí, continuar"
        tono="peligro"
        alCancelar={() => setConfirmarEstadoId(null)}
        alConfirmar={() => {
          if (confirmarEstadoId) {
            const usuario = usuariosOrdenados.find((u) => u.id === confirmarEstadoId);
            cambiarEstadoUsuario(confirmarEstadoId);
            mostrarAviso(`${usuario?.nombre ?? "Usuario"} ${usuario?.activo ? "desactivado" : "activado"}`, "exito");
            setConfirmarEstadoId(null);
          }
        }}
      />
    </div>
  );
}
