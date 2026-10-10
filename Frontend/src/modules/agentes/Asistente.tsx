import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ConfiguracionAgente, RevisionAgente } from "@ambie/contrato";
import { useAuth } from "../../context/auth";
import { api, usaApi } from "../../data/api";
import { agenteGuardando, contextoAgente, cambiarRevisionAgente, confirmarDesdeAgente, revisionAgente, useRevisionAgente } from "./operacion-agente";
import { hablar, transcribirArchivo } from "./audio";
import { abrirMicrofono } from "./microfono";

type Estado = { habilitado: boolean; modo: string; configurado: boolean; audio: ConfiguracionAgente["audio"] };

/** El borrador vive en memoria y se presenta en el formulario del negocio. */
export default function Asistente() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const revision = useRevisionAgente();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [texto, setTexto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const generacion = useRef(0);
  const bloqueo = useRef(false);
  const detenerMicrofono = useRef<(() => void) | null>(null);
  const interpretarActual = useRef<(orden: string) => Promise<void>>(async () => {});
  const [escuchando, setEscuchando] = useState(false);
  useEffect(() => {
    const limpiar = () => { generacion.current++; detenerMicrofono.current?.(); detenerMicrofono.current = null; setEscuchando(false); bloqueo.current = false; cambiarRevisionAgente(null); setAbierto(false); setEstado(null); setTexto(""); setMensaje(""); setOcupado(false); window.speechSynthesis?.cancel(); };
    limpiar();
    window.addEventListener("ambie:sesion-expirada", limpiar);
    return () => { generacion.current++; detenerMicrofono.current?.(); detenerMicrofono.current = null; cambiarRevisionAgente(null); window.speechSynthesis?.cancel(); window.removeEventListener("ambie:sesion-expirada", limpiar); };
  }, [usuario?.id, usuario?.rol]);
  useEffect(() => {
    const aviso = (e: Event) => setMensaje(String((e as CustomEvent<unknown>).detail));
    window.addEventListener("ambie:agente-aviso", aviso);
    return () => window.removeEventListener("ambie:agente-aviso", aviso);
  }, []);
  useEffect(() => {
    if (!abierto || !usuario || !usaApi) return;
    let vigente = true;
    api<Estado>("/agentes/estado").then(r => { if (vigente) setEstado(r); }).catch(e => { if (vigente) setMensaje(e instanceof Error ? e.message : "No se pudo consultar la configuración"); });
    return () => { vigente = false; };
  }, [abierto, usuario]);
  async function ejecutar(tarea: () => Promise<void>) {
    if (bloqueo.current || agenteGuardando()) return;
    bloqueo.current = true; setOcupado(true);
    const turno = generacion.current;
    try { await tarea(); } catch (e) { if (turno === generacion.current) setMensaje(e instanceof Error ? e.message : "No se pudo completar la instrucción"); }
    finally { if (turno === generacion.current) { bloqueo.current = false; setOcupado(false); } }
  }
  async function interpretar(instruccion = texto) {
    const orden = instruccion.trim();
    if (!orden) return;
    await ejecutar(async () => {
      const turno = generacion.current;
      const anterior = revisionAgente();
      if (/^confirmar(?:\s+(?:pedido|operación|operacion))?[.!]?$/i.test(orden)) { await confirmarDesdeAgente(); return; }
      if (/^cancelar(?:\s+(?:instrucción|instruccion))?[.!]?$/i.test(orden)) { cambiarRevisionAgente(null); setTexto(""); setMensaje("Instrucción cancelada. No se guardó una operación"); return; }
      const resultado = await api<RevisionAgente>("/agentes/interpretar", "POST", { texto: orden, contexto: contextoAgente(), ...(anterior ? { anterior: anterior.instruccion, id: anterior.id, version: anterior.version + 1 } : {}) });
      if (turno !== generacion.current || revisionAgente() !== anterior || agenteGuardando()) return;
      cambiarRevisionAgente(resultado); setMensaje(resultado.resumen); setTexto(""); navegar(resultado.ruta);
      if (estado && escuchando) hablar(resultado.resumen, estado.audio);
    });
  }
  useEffect(() => { interpretarActual.current = interpretar; });
  if (!usuario || !usaApi) return null;
  return <aside className="fixed bottom-3 right-3 z-50 max-w-[calc(100vw-1.5rem)]" aria-label="Asistente de operaciones">
    {abierto && <section className="mb-2 w-80 max-w-full rounded-xl border border-line bg-paper-raised p-3 shadow-lg">
      <div className="flex items-center justify-between"><strong className="text-sm text-ink">Instrucciones completas</strong><button type="button" aria-label="Cerrar asistente" onClick={() => { generacion.current++; detenerMicrofono.current?.(); detenerMicrofono.current = null; setEscuchando(false); bloqueo.current = false; setOcupado(false); setAbierto(false); }}>×</button></div>
      <p className="my-2 text-xs text-ink-soft">Describe la operación completa. Revisa su detalle antes de confirmar.</p>
      {estado && !estado.habilitado && <p role="status" className="text-xs text-ink-soft">Habilita el asistente en Configuración.</p>}
      {estado?.modo === "live" && <p role="status" className="text-xs text-ink-soft">La conexión de audio Live requiere su prueba específica. Usa el modo híbrido para las primeras pruebas.</p>}
      <textarea aria-label="Instrucción o corrección" value={texto} disabled={ocupado} onChange={e => setTexto(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-paper p-2 text-sm" placeholder="Un pedido ocasional, dos productos, efectivo y para preparar…" />
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={ocupado || !estado?.habilitado || estado.modo === "live" || !texto.trim()} onClick={() => void interpretar()} className="rounded-lg bg-brand px-3 py-2 text-white">{ocupado ? "Procesando…" : "Preparar detalle"}</button>
        <button type="button" disabled={ocupado || !estado?.habilitado || estado.modo === "live"} className="rounded-lg border border-line px-3 py-2" onClick={() => {
          if (escuchando) { detenerMicrofono.current?.(); detenerMicrofono.current = null; setEscuchando(false); return; }
          void ejecutar(async () => {
            const turno = generacion.current;
            const detener = await abrirMicrofono(valor => { if (turno !== generacion.current || window.speechSynthesis?.speaking) return; setTexto(valor); void interpretarActual.current(valor); }, aviso => { if (turno !== generacion.current) return; setMensaje(aviso); if (aviso === "Micrófono desconectado") setEscuchando(false); }, detener => { if (turno !== generacion.current) detener(); else detenerMicrofono.current = detener; });
            if (turno !== generacion.current) { detener(); return; }
            detenerMicrofono.current = detener; setEscuchando(true); setMensaje("Escuchando. Puedes dictar la operación completa");
          });
        }}>{escuchando ? "Detener micrófono" : "Hablar"}</button>
        <label className="cursor-pointer rounded-lg border border-line px-3 py-2">Cargar audio<input type="file" accept="audio/*" className="sr-only" disabled={ocupado || !estado?.habilitado || estado.modo === "live"} onChange={e => { const archivo = e.target.files?.[0]; e.target.value = ""; if (!archivo || !estado) return; void ejecutar(async () => { const turno = generacion.current; const r = await transcribirArchivo(archivo, estado.audio); if (turno === generacion.current) { setTexto(r.texto); setMensaje("Revisa el texto reconocido y prepara el detalle"); } }); }} /></label>
      </div>
      {revision && <div className="mt-2 flex gap-2 text-xs"><button type="button" disabled={ocupado} onClick={() => void ejecutar(async () => { await confirmarDesdeAgente(); })} className="rounded-lg border border-line px-3 py-2">Confirmar</button><button type="button" disabled={ocupado} onClick={() => { cambiarRevisionAgente(null); setMensaje("Instrucción cancelada. No se guardó una operación"); }}>Cancelar instrucción</button></div>}
      {mensaje && <p role="status" className="mt-2 text-xs text-ink-soft">{mensaje}</p>}
    </section>}
    <button type="button" aria-expanded={abierto} onClick={() => { if (abierto) { generacion.current++; detenerMicrofono.current?.(); detenerMicrofono.current = null; setEscuchando(false); bloqueo.current = false; setOcupado(false); } setAbierto(v => !v); }} className="rounded-full border border-line bg-paper-raised px-4 py-2 text-sm font-semibold text-ink shadow">Asistente{escuchando ? " · Micrófono activo" : ""}</button>
  </aside>;
}
