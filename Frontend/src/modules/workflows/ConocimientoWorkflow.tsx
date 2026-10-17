import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, respuestaRed } from "../../data/api";
import { claveConsulta, consultas } from "../../data/query";
import { Boton } from "../../components/Boton";
import { GrafoConocimiento } from "./GrafoConocimiento";
import { SimuladorConocimiento } from "./SimuladorConocimiento";
import { uuidWorkflow } from "./grafo-modelo";
import { leerMarkdown, LIMITE_DOCUMENTO, LIMITE_REGLAS, LIMITE_FUENTES, validarConocimiento, type ConfigConocimiento, type ConexionConocimiento, type FuenteConocimiento, type ModuloWorkflow } from "./conocimiento-modelo";

export function ConocimientoWorkflow({ empresa, modulos, modulosCargando, errorModulos }: {
  empresa: string; modulos: ModuloWorkflow[]; modulosCargando: boolean; errorModulos?: string;
}) {
  const raiz = `/workflows/empresas/${encodeURIComponent(empresa)}`;
  const comercial = empresa === "comercial";
  const ruta = `${raiz}/conocimiento`;
  const titulo = useId();
  const lectura = useQuery({ queryKey: claveConsulta(ruta), queryFn: async ({ signal }) => (await respuestaRed<{ data: ConfigConocimiento }>(ruta, "GET", undefined, signal)).data });
  const conexiones = useQuery({ queryKey: claveConsulta(`${raiz}/conexiones`), enabled: !comercial, queryFn: async ({ signal }) => (await respuestaRed<{ data: ConexionConocimiento[] }>(`${raiz}/conexiones`, "GET", undefined, signal)).data });
  const [borrador, setBorrador] = useState<ConfigConocimiento | null>(null);
  const [ocupado, setOcupado] = useState(false), [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [aviso, setAviso] = useState(""), [error, setError] = useState("");
  const bloqueo = useRef(false);
  const config = borrador ?? lectura.data;
  const bloqueado = ocupado || cargandoArchivo;
  function editar(cambio: Partial<ConfigConocimiento>) {
    if (!config || bloqueado) return;
    setBorrador({ ...config, ...cambio, publicado: false }); setAviso("");
  }
  function editarFuente(id: string, cambio: Partial<FuenteConocimiento>) {
    if (config) editar({ fuentes: config.fuentes.map(f => f.id === id ? { ...f, ...cambio } : f) });
  }
  async function cargarArchivo(archivo: File | undefined, destino: "reglas" | string) {
    if (!archivo || !config || bloqueo.current || bloqueado) return;
    bloqueo.current = true; setCargandoArchivo(true); setError("");
    try {
      const texto = await leerMarkdown(archivo);
      if (destino === "reglas" && texto.length > LIMITE_REGLAS) throw new Error("El documento de reglas admite hasta 12.000 caracteres.");
      setBorrador(actual => {
        const base = actual ?? config;
        return destino === "reglas" ? { ...base, reglas: texto, publicado: false } : { ...base, fuentes: base.fuentes.map(f => f.id === destino ? { ...f, texto } : f), publicado: false };
      });
      setAviso("Archivo cargado en el borrador. Guarda para conservarlo.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el archivo."); }
    finally { bloqueo.current = false; setCargandoArchivo(false); }
  }
  async function guardar(publicado: boolean) {
    if (!config || bloqueo.current || bloqueado) return;
    if (comercial && (config.fuentes.some(f => f.tipo !== "md") || config.modulos.length !== 1 || config.modulos[0] !== "comercial")) { setError("La landing comercial solo admite fuentes Markdown y el módulo Landing comercial."); return; }
    const invalido = validarConocimiento(config, conexiones.data ?? [], modulos);
    if (invalido) { setError(invalido); return; }
    bloqueo.current = true; setOcupado(true); setError(""); setAviso("");
    // Captura la clave de sesión antes de la escritura y conserva el borrador si falla.
    const clave = claveConsulta(ruta);
    try {
      const confirmado = await api<ConfigConocimiento>(ruta, "PUT", { ...config, publicado });
      consultas.setQueryData(clave, confirmado);
      setBorrador(null);
      setAviso(`${confirmado.publicado ? "Conocimiento publicado" : "Borrador guardado"} · versión ${confirmado.version}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar. Conservamos tus cambios."); }
    finally { bloqueo.current = false; setOcupado(false); }
  }
  async function retirar() {
    if (bloqueado || !window.confirm("¿Retirar la publicación? El agente dejará de usarla hasta que publiques otra vez. Se conservan tus documentos.")) return;
    bloqueo.current = true; setOcupado(true); setError("");
    try {
      const confirmado = await api<ConfigConocimiento>(`${raiz}/despublicar`, "POST", {});
      consultas.setQueryData(claveConsulta(ruta), confirmado); setBorrador(null); setAviso("Publicación retirada. Puedes editar y volver a publicar.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo retirar la publicación."); }
    finally { bloqueo.current = false; setOcupado(false); }
  }
  const fallo = error || lectura.error?.message || conexiones.error?.message || errorModulos;
  return <section className="wf-editor space-y-4" aria-labelledby={titulo}>
    <div className="wf-cabecera"><div><h2 id={titulo}>Conocimiento y prueba</h2><p className="wf-ayuda">{comercial ? "Documento y fuentes Markdown de Landing comercial · ABINOVA." : "Documento del negocio, reglas y fuentes autorizadas de la empresa elegida."}</p></div>{config && <span className="wf-insignia">Versión {config.version} · {borrador ? "Cambios sin guardar" : config.publicado ? "Publicado" : "Borrador guardado"}</span>}</div>
    {fallo && <p role="alert" className="wf-error">{fallo}</p>}
    {aviso && <p role="status" className="wf-ayuda">{aviso}</p>}
    {config && <div className="flex flex-wrap items-center gap-2"><p className="wf-ayuda">Guardar un borrador conserva la versión publicada anterior. Retirar publicación detiene su uso.</p><Boton variante="fantasma" disabled={bloqueado} onClick={() => void retirar()}>Retirar publicación</Boton></div>}
    {lectura.isPending && <p role="status">Cargando conocimiento…</p>}
    {lectura.isError && <Boton variante="fantasma" onClick={() => { void lectura.refetch(); }}>Reintentar lectura</Boton>}
    {config && <>
      {borrador && lectura.data && lectura.data.version !== borrador.version && <p role="alert" className="wf-error">Hay una versión más reciente en el servidor. Conservamos tu borrador; revisa y copia tus cambios antes de cargar la versión guardada.</p>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void guardar(false); }}>
        <fieldset disabled={bloqueado} className="space-y-4">
          <div className="wf-datos"><label>Nombre del negocio<input required maxLength={100} value={config.nombreNegocio} onChange={e => editar({ nombreNegocio: e.target.value })} /></label>
            <label>Perfil del negocio<select value={config.perfil} onChange={e => editar({ perfil: e.target.value as ConfigConocimiento["perfil"] })}>{["restaurante", "tienda", "supermercado", "carniceria", "otro"].map(p => <option key={p} value={p}>{({ restaurante: "Restaurante", tienda: "Tienda", supermercado: "Supermercado", carniceria: "Carnicería", otro: "Otro" })[p]}</option>)}</select></label></div>
          <label>Descripción del negocio<textarea rows={3} maxLength={2000} value={config.descripcion} onChange={e => editar({ descripcion: e.target.value })} /></label>
          <label>Reglas del negocio (Markdown)<textarea rows={6} maxLength={LIMITE_REGLAS} value={config.reglas} onChange={e => editar({ reglas: e.target.value })} /><small className="wf-ayuda">{config.reglas.length.toLocaleString("es-CO")} / 12.000 caracteres</small></label>
          <label>Cargar archivo de reglas .md (máximo 20.000 bytes y 12.000 caracteres; reemplaza el texto del borrador)<input type="file" accept=".md,text/markdown" onChange={e => { const archivo = e.target.files?.[0]; e.target.value = ""; void cargarArchivo(archivo, "reglas"); }} /></label>
          <fieldset className="wf-inspector"><legend>Módulos del conocimiento</legend><p className="wf-ayuda">Selecciona los módulos que podrán usar este documento. La disponibilidad corresponde a esta empresa.</p>
            {modulosCargando && <p role="status">Cargando módulos…</p>}
            <div className="wf-modulos">{modulos.map(m => <label key={m.id} className="wf-casilla"><input type="checkbox" disabled={comercial || (!m.habilitado && !config.modulos.includes(m.id))} checked={config.modulos.includes(m.id)} onChange={e => editar({ modulos: e.target.checked ? [...config.modulos, m.id] : config.modulos.filter(id => id !== m.id) })} /><span>{m.nombre}{!m.habilitado ? " · No habilitado" : ""}</span></label>)}</div>
            {config.modulos.filter(id => !modulos.some(m => m.id === id)).map(id => <label className="wf-casilla" key={id}><input type="checkbox" checked onChange={() => editar({ modulos: config.modulos.filter(m => m !== id) })} /><span>{id} · No disponible (retirar)</span></label>)}
          </fieldset>
          <section className="space-y-3" aria-label="Fuentes de conocimiento"><h3 className="font-semibold">Fuentes de conocimiento</h3><p className="wf-ayuda">{comercial ? "La landing comercial utiliza únicamente documentos Markdown." : "Markdown se edita aquí. API y PostgreSQL usan alias ya configurados; no introduzcas credenciales ni cadenas de conexión."}</p>
            {!comercial && conexiones.isPending && <p role="status">Cargando alias y tablas autorizadas…</p>}
            {conexiones.isError && <Boton variante="fantasma" onClick={() => { void conexiones.refetch(); }}>Reintentar conexiones</Boton>}
            {config.fuentes.map((fuente, i) => {
              const tablas = conexiones.data?.find(c => c.id === fuente.conexion)?.tablas ?? [];
              return <fieldset key={fuente.id} className="wf-inspector"><legend>Fuente {i + 1}</legend>
                <label>Nombre de la fuente<input required maxLength={100} value={fuente.nombre} onChange={e => editarFuente(fuente.id, { nombre: e.target.value })} /></label>
                <label>Tipo de fuente<select value={fuente.tipo} onChange={e => editarFuente(fuente.id, { tipo: e.target.value as FuenteConocimiento["tipo"], conexion: "", tabla: "", texto: "" })}><option value="md">Documento Markdown</option>{!comercial && <><option value="api">API mediante alias</option><option value="postgres">PostgreSQL mediante alias y tabla</option></>}</select></label>
                {fuente.tipo === "md" ? <><label>Documento Markdown<textarea rows={6} maxLength={LIMITE_DOCUMENTO} value={fuente.texto} onChange={e => editarFuente(fuente.id, { texto: e.target.value })} /><small className="wf-ayuda">{fuente.texto.length.toLocaleString("es-CO")} / 20.000 caracteres</small></label><label>Cargar .md (máximo 20.000 bytes; reemplaza este documento)<input type="file" accept=".md,text/markdown" onChange={e => { const archivo = e.target.files?.[0]; e.target.value = ""; void cargarArchivo(archivo, fuente.id); }} /></label></> : <>
                  <label>Alias de conexión<select required value={fuente.conexion} onChange={e => editarFuente(fuente.id, { conexion: e.target.value, tabla: "" })}><option value="">Selecciona un alias autorizado</option>{fuente.conexion && !conexiones.data?.some(c => c.id === fuente.conexion) && <option value={fuente.conexion} disabled>Alias guardado no disponible</option>}{conexiones.data?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
                  {fuente.tipo === "postgres" && <label>Tabla autorizada<select required value={fuente.tabla} disabled={!fuente.conexion} onChange={e => editarFuente(fuente.id, { tabla: e.target.value })}><option value="">Selecciona una tabla</option>{fuente.tabla && !tablas.includes(fuente.tabla) && <option value={fuente.tabla} disabled>Tabla guardada no disponible</option>}{tablas.map(tabla => <option key={tabla} value={tabla}>{tabla}</option>)}</select></label>}
                </>}
                <Boton variante="peligro" onClick={() => editar({ fuentes: config.fuentes.filter(f => f.id !== fuente.id) })}>Quitar fuente {i + 1}</Boton>
              </fieldset>;
            })}
            <Boton variante="fantasma" disabled={config.fuentes.length >= LIMITE_FUENTES} onClick={() => editar({ fuentes: [...config.fuentes, { id: uuidWorkflow(), nombre: "Nueva fuente", tipo: "md", texto: "", conexion: "", tabla: "" }] })}>Agregar fuente</Boton>
          </section>
        </fieldset>
        {cargandoArchivo && <p role="status">Leyendo archivo Markdown…</p>}
        <p className="wf-ayuda">Antes de publicar, elige la conexión y el modelo en «Configurar conexión y cupo». Guardar borrador permite revisar el documento; la landing comercial solo utiliza el conocimiento publicado.</p>
        <div className="wf-acciones"><Boton type="submit" disabled={bloqueado || modulosCargando || !!errorModulos}>{ocupado ? "Guardando…" : "Guardar borrador"}</Boton><Boton type="submit" variante="secundario" disabled={bloqueado || modulosCargando || !!errorModulos} onClick={e => { e.preventDefault(); const formulario = e.currentTarget.form; if (formulario?.reportValidity()) void guardar(true); }}>Guardar y publicar</Boton></div>
        {borrador && <Boton variante="fantasma" disabled={bloqueado || lectura.isFetching} onClick={() => { if (window.confirm("¿Descartar los cambios sin guardar y cargar la versión guardada?")) { setBorrador(null); setError(""); setAviso(""); void lectura.refetch(); } }}>Descartar cambios y cargar versión guardada</Boton>}
      </form>
      <GrafoConocimiento config={config} />
      <SimuladorConocimiento raiz={raiz} modulos={modulos.filter(m => config.modulos.includes(m.id))} cambiosPendientes={!!borrador || bloqueado} />
    </>}
  </section>;
}
