import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth";
import { OperacionesProvider } from "../../context/OperacionesContext";
import { respuestaRed } from "../../data/api";
import { claveConsulta } from "../../data/query";
import Workflows from "./Workflows";

const Usuarios = lazy(() => import("../usuarios/screens/UsuariosAdmin").then(m => ({ default: m.UsuariosAdmin })));
const Agentes = lazy(() => import("../agentes/PanelAgentes").then(m => ({ default: m.PanelAgentes })));
const OfertaAgentes = lazy(() => import("./OfertaAgentes"));
const Modulos = lazy(() => import("./ModulosControl"));
const Condiciones = lazy(() => import("./CondicionesComerciales"));
const secciones = { empresas: "Empresas", modulos: "Módulos por plan", flujos: "Workflows", modelos: "Modelos incluidos", planes: "Precios y condiciones", usuarios: "Usuarios y permisos", agentes: "Agentes de esta instalación" };
type Seccion = keyof typeof secciones;
type Registro = { empresas: Array<{ id: string; nombre: string; propia: boolean }>; aprovisionamientoAutomatico: boolean };

export default function Operador() {
  const { usuario, cerrarSesion } = useAuth();
  const navegar = useNavigate();
  const [seccion, setSeccion] = useState<Seccion>("empresas");
  const [empresa, setEmpresa] = useState("");
  const registro = useQuery({
    queryKey: claveConsulta("/workflows/operador"),
    queryFn: async ({ signal }) => (await respuestaRed<{ data: Registro }>("/workflows/operador", "GET", undefined, signal)).data,
    enabled: !!usuario?.esSistema,
  });
  const propia = registro.data?.empresas.find(e => e.propia);
  const origenCliente = new URL(window.location.origin);
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    if (origenCliente.port === "8792") origenCliente.port = "8080";
    if (origenCliente.port === "8192") origenCliente.port = "8180";
  }
  async function salir() { if (await cerrarSesion()) navegar("/operador/acceso", { replace: true }); }
  function abrirFlujos(id: string) { setEmpresa(id); setSeccion("flujos"); }

  if (!usuario?.esSistema) return <Navigate to="/admin/configuracion" replace />;

  return <main className="h-full min-h-0 overflow-y-auto bg-paper text-ink">
    <header className="border-b border-line bg-paper-raised p-3 sm:p-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-lg font-semibold">ABINOVA · Panel de mando</h1><p className="text-xs text-ink-soft">Operador · {usuario?.nombre}</p></div>
        <div className="flex flex-wrap gap-3 text-sm"><a className="underline" href={`${origenCliente.origin}/comercial/`} target="_blank" rel="noreferrer">Ver landing</a><a className="underline" href={`${origenCliente.origin}/admin`}>Abrir negocio de esta instalación</a><button type="button" onClick={() => void salir()}>Salir</button></div>
      </div>
      <nav aria-label="Control del operador" className="mx-auto mt-3 flex max-w-6xl gap-2 overflow-x-auto pb-1">
        {(Object.entries(secciones) as Array<[Seccion, string]>).map(([id, texto]) => <button type="button" key={id} aria-current={seccion === id ? "page" : undefined} onClick={() => setSeccion(id)} className={`shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold ${seccion === id ? "bg-accent text-accent-ink" : "border border-line"}`}>{texto}</button>)}
      </nav>
    </header>
    <div className="mx-auto max-w-6xl p-2 sm:p-4">
      {registro.isPending && <p role="status">Cargando empresas conectadas…</p>}
      {registro.error && <p role="alert" className="p-3 text-danger">{registro.error.message}<button type="button" className="ml-3 underline" onClick={() => void registro.refetch()}>Reintentar</button></p>}
      {registro.data && <>
        {seccion === "empresas" && <section className="space-y-3">
          <h2 className="text-lg font-semibold">Empresas conectadas</h2>
          <p className="text-sm text-ink-soft">Cada empresa mantiene su instalación y sus datos separados. Desde aquí controlas los workflows registrados y sus cupos de IA.</p>
          {!registro.data.aprovisionamientoAutomatico && <p className="rounded-xl border border-line bg-paper-raised p-3 text-sm">El alta automática de empresas sigue pendiente. En Módulos por plan puedes configurar el catálogo, limitar los accesos de cada plan y asignar excepciones a las empresas conectadas. Registrar un módulo futuro no instala su código.</p>}
          <div className="grid gap-3 sm:grid-cols-2">{registro.data.empresas.map(e => <article key={e.id} className="space-y-3 rounded-xl border border-line bg-paper-raised p-4">
            <div><h3 className="font-semibold">{e.nombre}</h3><p className="text-xs text-ink-soft">{e.id} · {e.id === "comercial" ? "Agente de la landing, sin datos privados" : e.propia ? "Negocio de esta instalación" : "Instalación independiente"}</p></div>
            <button type="button" className="rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-ink" onClick={() => abrirFlujos(e.id)}>Workflows, conexión y créditos</button>
            {e.propia && <><p className="text-xs text-ink-soft">Acceso maestro: cada escritura queda identificada como prueba y conserva a system como responsable.</p><div className="flex flex-wrap gap-3 text-sm"><a className="underline" href={`${origenCliente.origin}/admin`}>Administrador</a><a className="underline" href={`${origenCliente.origin}/vendedor`}>Vendedor</a><a className="underline" href={`${origenCliente.origin}/inventario`}>Inventario</a><button type="button" className="underline" onClick={() => setSeccion("usuarios")}>Usuarios y permisos de módulos</button><button type="button" className="underline" onClick={() => setSeccion("agentes")}>Configurar agentes</button></div></>}
          </article>)}</div>
        </section>}
        {(seccion === "flujos" || seccion === "planes") && <Workflows key={`${seccion}:${empresa}`} operador integrado vistaInicial={seccion} empresaInicial={empresa} />}
        <Suspense fallback={<p role="status">Cargando controles…</p>}>
          {seccion === "modelos" && <OfertaAgentes />}
          {seccion === "modulos" && <Modulos empresas={registro.data.empresas.filter(e => e.id !== "comercial")} />}
          {seccion === "planes" && <Condiciones />}
          {seccion === "usuarios" && propia && <><p className="mb-3 text-sm text-ink-soft">Usuarios de {propia.nombre}. Los permisos habilitan o restringen los módulos existentes para cada usuario; no instalan servicios nuevos.</p><div className="min-h-[600px]"><OperacionesProvider><Usuarios /></OperacionesProvider></div></>}
          {seccion === "agentes" && propia && <><p className="mb-3 text-sm text-ink-soft">Conexiones y modo de los agentes de {propia.nombre}. Para otra empresa, usa sus workflows y la configuración de su propia instalación.</p><Agentes /></>}
          {(seccion === "usuarios" || seccion === "agentes") && !propia && <p>Esta central no tiene un negocio propio conectado. Administra los usuarios y las claves desde la instalación correspondiente.</p>}
        </Suspense>
      </>}
    </div>
  </main>;
}
