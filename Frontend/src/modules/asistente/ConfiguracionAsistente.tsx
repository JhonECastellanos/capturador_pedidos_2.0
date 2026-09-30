import { useEffect, useState, type FormEvent } from "react";
import type { ConfiguracionAsistentePublica } from "@ambie/contrato";
import { api } from "../../data/api";
import { Boton } from "../../components/Boton";

export function ConfiguracionAsistente() {
  const [config, setConfig] = useState<ConfiguracionAsistentePublica | null>(null);
  const [clave, setClave] = useState("");
  const [borrarClave, setBorrarClave] = useState(false);
  const [modelos, setModelos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [modificada, setModificada] = useState(false);
  useEffect(() => { let activo = true; void api<ConfiguracionAsistentePublica>("/asistente/configuracion").then((c) => { if (activo) setConfig(c); }).catch((e: Error) => { if (activo) setMensaje(e.message); }); return () => { activo = false; }; }, []);
  async function guardar(e: FormEvent) {
    e.preventDefault(); if (!config || ocupado) return;
    setOcupado(true); setMensaje("");
    try {
      const { tieneClave: _tiene, ...datos } = config;
      const resultado = await api<ConfiguracionAsistentePublica>("/asistente/configuracion", "PUT", { ...datos, clave: clave || undefined, borrarClave });
      setConfig(resultado); setClave(""); setBorrarClave(false); setModificada(false); setMensaje("Configuración guardada.");
      window.dispatchEvent(new Event("ambie:asistente-configurado"));
    } catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setOcupado(false); }
  }
  async function consultarModelos() {
    setOcupado(true); setMensaje("");
    try { const disponibles = await api<string[]>("/asistente/modelos"); setModelos(disponibles); setMensaje(disponibles.length ? "Selecciona un modelo. La disponibilidad y las cuotas dependen de tu cuenta." : "El proveedor no devolvió modelos. Puedes escribir el identificador."); }
    catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudieron consultar los modelos."); }
    finally { setOcupado(false); }
  }
  async function instalarVoz() {
    setOcupado(true); setMensaje("");
    try { const resultado = await api<{ disponible: boolean }>("/asistente/voz/estado"); setMensaje(resultado.disponible ? "Reconocimiento local disponible. Abre el micrófono para probar una conversación." : "No hay conexión con el contenedor voz. Activa el perfil voz de Docker."); }
    catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudo instalar la voz."); }
    finally { setOcupado(false); }
  }
  function cambiar(cambios: Partial<ConfiguracionAsistentePublica>) { if (config) { setConfig({ ...config, ...cambios }); setModificada(true); } }
  if (!config) return <div className="p-4 text-sm text-ink" role="status">{mensaje || "Cargando configuración…"}</div>;
  const clases = "mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm";
  return <section className="min-h-0 flex-1 overflow-y-auto pb-6"><h1 className="font-display text-xl font-semibold text-ink">Configuración</h1><p className="mt-1 text-sm text-ink-soft">Asistente y voz para el negocio. Solo el administrador puede cambiar la conexión.</p>
    <form onSubmit={(e) => void guardar(e)} className="mt-4 max-w-xl space-y-4 rounded-2xl border border-line bg-paper-raised p-4">
      <fieldset disabled={ocupado} className="space-y-4">
        <label className="block text-sm font-medium">Proveedor<select className={clases} value={config.proveedor} onChange={(e) => { cambiar({ proveedor: e.target.value as ConfiguracionAsistentePublica["proveedor"], modelo: "", urlBase: "", tieneClave: false }); setClave(""); setModelos([]); }}><option value="basico">Básico · sin claves ni consumo</option><option value="gemini">Google Gemini</option><option value="groq">Groq</option><option value="compatible">API compatible personalizada</option></select></label>
        <p className="text-xs leading-relaxed text-ink-soft">El modo básico reconoce acciones sencillas y abre formularios. Gemini y Groq pueden ofrecer cuotas gratuitas según tu cuenta. No se activa facturación ni se cambia de proveedor automáticamente.</p>
        {config.proveedor !== "basico" && <>
          {config.proveedor === "compatible" && <label className="block text-sm font-medium">URL base de la API<input className={clases} type="url" required value={config.urlBase} placeholder="https://tu-proveedor.example/v1" onChange={(e) => { cambiar({ urlBase: e.target.value, tieneClave: false }); setClave(""); setModelos([]); }} /></label>}
          <label className="block text-sm font-medium">Modelo<input className={clases} list="modelos-asistente" required value={config.modelo} placeholder="Identificador del modelo del proveedor" onChange={(e) => cambiar({ modelo: e.target.value })} /><datalist id="modelos-asistente">{modelos.map((m) => <option key={m} value={m} />)}</datalist></label>
          <label className="block text-sm font-medium">Clave de API<input className={clases} type="password" autoComplete="new-password" value={clave} placeholder={config.tieneClave ? "Clave guardada · deja vacío para conservar" : "Clave del proveedor (si la requiere)"} onChange={(e) => { setClave(e.target.value); setModificada(true); }} /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={borrarClave} onChange={(e) => { setBorrarClave(e.target.checked); setModificada(true); }} />Borrar la clave guardada</label>
          <p className="text-xs text-ink-soft">La clave se guarda cifrada en el servidor y no se devuelve al navegador. Al enviar una instrucción, su texto se comparte con el proveedor seleccionado.</p>
          <Boton type="button" variante="fantasma" disabled={modificada || ocupado} onClick={() => void consultarModelos()}>Consultar modelos disponibles</Boton><p className="text-xs text-ink-soft">Guarda primero la conexión y un identificador de modelo para consultar el catálogo. El catálogo no identifica cuáles tienen cuota gratuita.</p>
        </>}
        <div className="border-t border-line pt-3"><h2 className="font-semibold">Conversación en vivo</h2><label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={config.vozHabilitada} onChange={(e) => cambiar({ vozHabilitada: e.target.checked })} />Habilitar micrófono y reconocimiento local</label><p className="text-xs text-ink-soft">El audio se procesa en el contenedor voz con Vosk en español. No se guarda ni se envía a un proveedor externo. En producción, el micrófono requiere HTTPS.</p><Boton type="button" variante="fantasma" className="mt-3" onClick={() => void instalarVoz()}>Comprobar servicio de voz</Boton><label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={config.confirmacionVoz} onChange={(e) => cambiar({ confirmacionVoz: e.target.checked })} />Confirmar o cancelar operaciones con comandos de voz</label><label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={config.responderConVoz} onChange={(e) => cambiar({ responderConVoz: e.target.checked })} />Leer respuestas con una voz española instalada en el dispositivo</label><p className="text-xs text-ink-soft">Si no existe una voz local, la respuesta aparece en pantalla. Nunca se usa una voz remota automáticamente.</p></div>
        <Boton type="submit">{ocupado ? "Guardando…" : "Guardar configuración"}</Boton>
      </fieldset>
      {mensaje && <p role="status" aria-live="polite" className="rounded-xl bg-paper-sunken p-3 text-sm">{mensaje}</p>}
    </form>
  </section>;
}
