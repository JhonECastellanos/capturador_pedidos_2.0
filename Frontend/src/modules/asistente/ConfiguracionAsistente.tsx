import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ComprobacionModeloAsistenteDTO, ConfiguracionAsistentePublica, Envelope } from "@ambie/contrato";
import { api, respuestaRed } from "../../data/api";
import { Boton } from "../../components/Boton";
import { SesionVoz } from "./sesion-voz";
import { useAviso } from "../../components/useAviso";
import { TiraToast } from "../../components/TiraToast";

export function ConfiguracionAsistente() {
  const [config, setConfig] = useState<ConfiguracionAsistentePublica | null>(null);
  const [clave, setClave] = useState("");
  const [borrarClave, setBorrarClave] = useState(false);
  const [modelos, setModelos] = useState<string[]>([]);
  const [resultados, setResultados] = useState<Record<string, ComprobacionModeloAsistenteDTO>>({});
  const [progreso, setProgreso] = useState<{ total: number; comprobados: number; modelo: string } | null>(null);
  const consultaModelos = useRef<AbortController | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso(3000);
  const [probandoVoz, setProbandoVoz] = useState(false);
  const [dictado, setDictado] = useState("");
  const pruebaVoz = useRef<SesionVoz | null>(null);
  const plazoVoz = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { pruebaVoz.current?.cerrar(); if (plazoVoz.current) clearTimeout(plazoVoz.current); }, []);
  useEffect(() => () => consultaModelos.current?.abort(), []);
  useEffect(() => { let activo = true; void api<ConfiguracionAsistentePublica>("/asistente/configuracion").then((c) => { if (activo) setConfig(c); }).catch((e: Error) => { if (activo) setMensaje(e.message); }); return () => { activo = false; }; }, []);
  async function guardar(e: FormEvent) {
    e.preventDefault(); if (!config || ocupado) return;
    detenerConsulta();
    setOcupado(true); setMensaje("");
    try {
      const { tieneClave: _tiene, ...datos } = config;
      const resultado = await api<ConfiguracionAsistentePublica>("/asistente/configuracion", "PUT", { ...datos, clave: clave || undefined, borrarClave });
      setConfig(resultado); setClave(""); setBorrarClave(false); setMensaje("Configuración guardada."); mostrarAviso("Configuración guardada", "exito");
      window.dispatchEvent(new Event("ambie:asistente-configurado"));
    } catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setOcupado(false); }
  }
  async function consultarModelos() {
    if (!config || ocupado) return;
    detenerConsulta();
    const control = new AbortController(); consultaModelos.current = control;
    setOcupado(true); setMensaje("");
    setResultados({});
    try {
      const { tieneClave: _tiene, ...datos } = config;
      const conexion = { ...datos, clave: clave || undefined, borrarClave };
      const disponibles = (await respuestaRed<Envelope<string[]>>("/asistente/modelos", "POST", conexion, control.signal)).data;
      if (control.signal.aborted) return;
      setModelos(disponibles); setOcupado(false);
      if (!disponibles.length) { setMensaje("El proveedor no devolvió modelos compatibles. Revisa el proyecto y los permisos."); return; }
      setMensaje("Puedes elegir un modelo verde mientras termina la revisión del catálogo.");
      // Una solicitud a la vez evita provocar límites con una ráfaga de pruebas.
      let correctos = 0;
      for (const [indice, modelo] of disponibles.entries()) {
        if (control.signal.aborted) return;
        setProgreso({ total: disponibles.length, comprobados: indice, modelo });
        try {
          const resultado = (await respuestaRed<Envelope<ComprobacionModeloAsistenteDTO>>("/asistente/conexion", "POST", { ...conexion, modelo }, control.signal)).data;
          if (control.signal.aborted) return;
          setResultados(actual => ({ ...actual, [modelo]: resultado }));
          if (resultado.disponible) correctos++;
        } catch (error) {
          if (control.signal.aborted) return;
          setMensaje(error instanceof Error ? error.message : "Se interrumpió la revisión. Los modelos restantes siguen sin comprobar.");
          return;
        }
      }
      setMensaje(`Revisión terminada: ${correctos} de ${disponibles.length} modelos respondieron. Elige uno verde y guarda la configuración.`);
    } catch (error) {
      if (!control.signal.aborted) { setModelos([]); setMensaje(error instanceof Error ? error.message : "No se pudieron consultar los modelos."); }
    } finally {
      if (consultaModelos.current === control) { consultaModelos.current = null; setProgreso(null); setOcupado(false); }
    }
  }
  async function comprobarConexion() {
    if (!config || ocupado) return;
    detenerConsulta();
    setOcupado(true); setMensaje("");
    try { const { tieneClave: _tiene, ...datos } = config; const resultado = await api<ComprobacionModeloAsistenteDTO>("/asistente/conexion", "POST", { ...datos, clave: clave || undefined, borrarClave }); setResultados(actual => ({ ...actual, [resultado.modelo]: resultado })); setMensaje(resultado.mensaje); mostrarAviso(resultado.disponible ? "El modelo respondió correctamente" : "Revisa el estado del modelo", resultado.disponible ? "exito" : "info"); }
    catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudo comprobar el modelo."); }
    finally { setOcupado(false); }
  }
  async function instalarVoz() {
    detenerConsulta();
    setOcupado(true); setMensaje("");
    try { const resultado = await api<{ disponible: boolean }>("/asistente/voz/estado"); setMensaje(resultado.disponible ? "Reconocimiento local disponible. Abre el micrófono para probar una conversación." : "No hay conexión con el contenedor voz. Activa el perfil voz de Docker."); }
    catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudo instalar la voz."); }
    finally { setOcupado(false); }
  }
  function detenerPruebaVoz() { pruebaVoz.current?.cerrar(); pruebaVoz.current = null; if (plazoVoz.current) clearTimeout(plazoVoz.current); plazoVoz.current = null; setProbandoVoz(false); }
  async function probarDictado() {
    if (pruebaVoz.current) { detenerPruebaVoz(); return; }
    if (document.querySelector('[aria-label^="Asistente de voz,"][aria-pressed="true"]')) { setMensaje("Apaga primero el micrófono flotante para probar el dictado."); return; }
    setDictado(""); setProbandoVoz(true);
    const sesion = new SesionVoz(evento => {
      if (evento.tipo === "final" && evento.texto) setDictado(anterior => `${anterior ? anterior + " · " : ""}${evento.texto} (${Math.round(evento.confianza * 100)}%)`);
      if (evento.tipo === "error") { setMensaje(evento.mensaje); detenerPruebaVoz(); }
    }, () => {});
    pruebaVoz.current = sesion;
    try { await sesion.iniciar(); if (pruebaVoz.current === sesion) plazoVoz.current = setTimeout(detenerPruebaVoz, 20000); }
    catch (error) { detenerPruebaVoz(); setMensaje(error instanceof Error ? error.message : "No se pudo probar el micrófono."); }
  }
  function cambiar(cambios: Partial<ConfiguracionAsistentePublica>) { setConfig(actual => actual ? { ...actual, ...cambios } : actual); }
  function detenerConsulta() { consultaModelos.current?.abort(); consultaModelos.current = null; setProgreso(null); }
  function cambiarConexion(cambios: Partial<ConfiguracionAsistentePublica>) { detenerConsulta(); setResultados({}); setModelos([]); cambiar(cambios); }
  function etiquetaModelo(modelo: string) {
    const resultado = resultados[modelo];
    if (!resultado) return `${progreso?.modelo === modelo ? "⏳ Comprobando" : "⚪ Sin comprobar"} · ${modelo}`;
    const etiqueta = resultado.estado === "disponible" ? "🟢 Respondió" : resultado.estado === "no-disponible" ? "🔴 Sin acceso o incompatible" : resultado.estado === "cuota-agotada" ? resultado.mensaje.startsWith("Cuota diaria") ? "🟡 Cuota diaria agotada" : "🟡 Cuota o límite alcanzado" : "🟡 Temporalmente no disponible";
    return `${etiqueta} · ${modelo}`;
  }
  if (!config) return <div className="p-4 text-sm text-ink" role="status">{mensaje || "Cargando configuración…"}</div>;
  const clases = "mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm";
  return <section className="min-h-0 flex-1 overflow-y-auto pb-6"><h1 className="font-display text-xl font-semibold text-ink">Configuración</h1><p className="mt-1 text-sm text-ink-soft">Asistente y voz para el negocio. Solo el administrador puede cambiar la conexión.</p>
    <form onSubmit={(e) => void guardar(e)} className="mt-4 max-w-xl space-y-4 rounded-2xl border border-line bg-paper-raised p-4">
      <fieldset disabled={ocupado} className="space-y-4">
        <label className="block text-sm font-medium">Proveedor<select className={clases} value={config.proveedor} onChange={(e) => { cambiarConexion({ proveedor: e.target.value as ConfiguracionAsistentePublica["proveedor"], modelo: "", urlBase: "", tieneClave: false }); setClave(""); }}><option value="basico">Básico · sin claves ni consumo</option><option value="gemini">Google Gemini</option><option value="groq">Groq</option><option value="compatible">API compatible personalizada</option></select></label>
        <p className="text-xs leading-relaxed text-ink-soft">El modo básico reconoce acciones sencillas y abre formularios. Gemini y Groq pueden ofrecer cuotas gratuitas según tu cuenta. No se activa facturación ni se cambia de proveedor automáticamente.</p>
        {config.proveedor !== "basico" && <>
          {config.proveedor === "compatible" && <label className="block text-sm font-medium">URL base de la API<input className={clases} type="url" required value={config.urlBase} placeholder="https://tu-proveedor.example/v1" onChange={(e) => { cambiarConexion({ urlBase: e.target.value, tieneClave: false }); setClave(""); }} /></label>}
          <label className="block text-sm font-medium">Modelo<input className={clases} list="modelos-asistente" value={config.modelo} placeholder="Consulta el catálogo y selecciona un modelo" onChange={(e) => cambiar({ modelo: e.target.value })} /><datalist id="modelos-asistente">{modelos.map((m) => <option key={m} value={m} label={etiquetaModelo(m)} />)}</datalist></label>
          {!!modelos.length && <label className="block text-sm font-medium">Modelos disponibles<select className={clases} value={modelos.includes(config.modelo) ? config.modelo : ""} onChange={e => cambiar({ modelo: e.target.value })}><option value="">Selecciona un modelo</option>{modelos.map(m => <option key={m} value={m}>{etiquetaModelo(m)}</option>)}</select></label>}
          {resultados[config.modelo] && <p className="text-xs text-ink-soft">{resultados[config.modelo].mensaje} Comprobado: {new Date(resultados[config.modelo].comprobadoEn).toLocaleTimeString("es-CO")}.</p>}
          {!!modelos.length && <p className="text-xs text-ink-soft">🟢 Respondió · 🟡 Cuota o fallo temporal · 🔴 No utilizable con esta conexión · ⚪ Sin comprobar. El resultado es puntual; puede cambiar después. El catálogo no indica si tu cuenta tiene cuota gratuita.</p>}
          <label className="block text-sm font-medium">Clave de API<input className={clases} type="password" autoComplete="new-password" value={clave} placeholder={config.tieneClave ? "Clave guardada · deja vacío para conservar" : "Clave del proveedor (si la requiere)"} onChange={(e) => { detenerConsulta(); setResultados({}); setClave(e.target.value); }} /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={borrarClave} onChange={(e) => { detenerConsulta(); setResultados({}); setBorrarClave(e.target.checked); }} />Borrar la clave guardada</label>
          <p className="text-xs text-ink-soft">La clave se guarda cifrada en el servidor y no se devuelve al navegador. Al enviar una instrucción, su texto se comparte con el proveedor seleccionado.</p>
          <Boton type="button" variante="fantasma" disabled={ocupado || !!progreso || borrarClave || (!clave && !config.tieneClave && config.proveedor !== "compatible")} onClick={() => void consultarModelos()}>Consultar modelos disponibles</Boton><p className="text-xs text-ink-soft">Al consultar se comprueba cada modelo con una prueba breve. Consume la cuota y, si tu cuenta tiene facturación activa, puede tener costo. No guarda pedidos ni cambia tu plan.</p>
          {progreso && <div className="text-xs"><p role="status">Comprobados {progreso.comprobados} de {progreso.total} · {progreso.modelo}</p><Boton type="button" variante="fantasma" onClick={() => { detenerConsulta(); setMensaje("Revisión detenida. Se conservan los resultados comprobados."); }}>Detener comprobación</Boton></div>}
          <Boton type="button" variante="fantasma" disabled={ocupado || !config.modelo || borrarClave || (!clave && !config.tieneClave && config.proveedor !== "compatible")} onClick={() => void comprobarConexion()}>{config.proveedor === "gemini" ? "Probar respuesta de Gemini" : "Probar respuesta del modelo"}</Boton>
        </>}
        <div className="border-t border-line pt-3"><h2 className="font-semibold">Conversación en vivo</h2><label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={config.vozHabilitada} onChange={(e) => cambiar({ vozHabilitada: e.target.checked })} />Habilitar micrófono y reconocimiento local</label><p className="text-xs text-ink-soft">El audio se procesa en el contenedor voz con Vosk en español. No se guarda ni se envía a un proveedor externo. En producción, el micrófono requiere HTTPS.</p><Boton type="button" variante="fantasma" className="mt-3" onClick={() => void instalarVoz()}>Comprobar servicio de voz</Boton><label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={config.confirmacionVoz} onChange={(e) => cambiar({ confirmacionVoz: e.target.checked })} />Confirmar o cancelar operaciones con comandos de voz</label><label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={config.responderConVoz} onChange={(e) => cambiar({ responderConVoz: e.target.checked })} />Leer respuestas con una voz española instalada en el dispositivo</label><p className="text-xs text-ink-soft">Si no existe una voz local, la respuesta aparece en pantalla. Nunca se usa una voz remota automáticamente.</p></div>
        <Boton type="submit">{ocupado ? "Guardando…" : "Guardar configuración"}</Boton>
      </fieldset>
      <details className="rounded-xl border border-line p-3 text-sm"><summary className="cursor-pointer font-semibold">Diagnóstico del micrófono · sin guardar</summary><p className="mt-2 text-xs text-ink-soft">Muestra únicamente lo que reconoce Vosk y su confianza. No interpreta órdenes, no consulta Gemini y no guarda audio ni pedidos. Se detiene a los 20 segundos.</p><Boton type="button" variante="fantasma" className="mt-2" onClick={() => void probarDictado()}>{probandoVoz ? "Detener prueba de dictado" : "Probar dictado sin guardar"}</Boton><output className="mt-2 block break-words" aria-live="polite">{dictado || (probandoVoz ? "Habla ahora…" : "Sin dictado de prueba.")}</output></details>
      {mensaje && <p role="status" aria-live="polite" className="rounded-xl bg-paper-sunken p-3 text-sm">{mensaje}</p>}
    </form>
    <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
  </section>;
}
