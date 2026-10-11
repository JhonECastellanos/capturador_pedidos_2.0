import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ConfiguracionAgente, RevisionAgente } from "@synchronic-jo/contrato";
import { useAuth } from "../../context/auth";
import { api, usaApi } from "../../data/api";
import { agenteGuardando, contextoAgente, cambiarRevisionAgente, confirmarDesdeAgente, revisionAgente } from "./operacion-agente";
import { hablar } from "./audio";
import { abrirMicrofono } from "./microfono";
import { RobotAsistente } from "./RobotAsistente";
import { respuestaCordial } from "./conversacion";

type Estado = { habilitado: boolean; modo: string; configurado: boolean; audio: ConfiguracionAgente["audio"] };

/** El borrador vive en memoria y se presenta en el formulario del negocio. */
export default function Asistente() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [ancho, setAncho] = useState(() => Math.max(200, Math.min(440, Number(localStorage.getItem("ambie:ui:ancho-asistente")) || 300)));
  const iniciando = useRef(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [texto, setTexto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const generacion = useRef(0);
  const generacionAudio = useRef(0);
  const vozActiva = useRef(false);
  const conversacionId = useRef("");
  const bloqueo = useRef(false);
  const detenerMicrofono = useRef<(() => void) | null>(null);
  const interpretarActual = useRef<(orden: string) => Promise<void>>(async () => {});
  const robot = useRef<HTMLButtonElement | null>(null);
  const [hablando, setHablando] = useState(false);
  const hablandoActual = useRef(false);
  const [escuchando, setEscuchando] = useState(false);
  useEffect(() => {
    const limpiar = () => { conversacionId.current = crypto.randomUUID(); generacion.current++; generacionAudio.current++; vozActiva.current = false; detenerMicrofono.current?.(); detenerMicrofono.current = null; setEscuchando(false); bloqueo.current = false; cambiarRevisionAgente(null); setAbierto(false); setHablando(false); setEstado(null); setTexto(""); setMensaje(""); setOcupado(false); window.speechSynthesis?.cancel(); };
    limpiar();
    window.addEventListener("synchronic:sesion-expirada", limpiar);
    return () => { generacion.current++; generacionAudio.current++; vozActiva.current = false; detenerMicrofono.current?.(); detenerMicrofono.current = null; cambiarRevisionAgente(null); window.speechSynthesis?.cancel(); window.removeEventListener("synchronic:sesion-expirada", limpiar); };
  }, [usuario?.id, usuario?.rol]);
  useEffect(() => {
    const aviso = (e: Event) => setMensaje(String((e as CustomEvent<unknown>).detail));
    window.addEventListener("ambie:agente-aviso", aviso);
    return () => window.removeEventListener("ambie:agente-aviso", aviso);
  }, []);
  useEffect(() => {
    if (!usuario || !usaApi) return;
    let vigente = true;
    api<Estado>("/agentes/estado").then(r => { if (vigente) setEstado(r); }).catch(e => { if (vigente) setMensaje(e instanceof Error ? e.message : "No se pudo consultar la configuración"); });
    return () => { vigente = false; };
  }, [usuario]);
  async function ejecutar(tarea: () => Promise<void>) {
    if (bloqueo.current || agenteGuardando()) return;
    bloqueo.current = true; setOcupado(true);
    const turno = generacion.current;
    try { await tarea(); } catch (e) { if (turno === generacion.current) { const aviso = e instanceof Error ? e.message : "No se pudo completar la instrucción"; setMensaje(aviso); if (estado && vozActiva.current) hablar(aviso, estado.audio); } }
    finally { if (turno === generacion.current) { bloqueo.current = false; setOcupado(false); } }
  }
  async function interpretar(instruccion = texto) {
    const orden = instruccion.trim();
    if (!orden) return;
    const cordial = respuestaCordial(orden);
    if (cordial) { setMensaje(cordial); setTexto(""); if (estado && vozActiva.current) hablar(cordial, estado.audio); return; }
    await ejecutar(async () => {
      const turno = generacion.current;
      const anterior = revisionAgente();
      if (/^confirmar(?:\s+(?:pedido|operación|operacion))?[.!]?$/i.test(orden)) { await confirmarDesdeAgente(); return; }
      if (/^cancelar(?:\s+(?:instrucción|instruccion))?[.!]?$/i.test(orden)) { cambiarRevisionAgente(null); setTexto(""); setMensaje("Instrucción cancelada. No se guardó una operación"); return; }
      setMensaje("Estoy preparando el detalle. No se ha guardado ninguna operación");
      if (estado && vozActiva.current) hablar("Claro, voy a revisar lo que me indicaste.", estado.audio);
      const resultado = await api<RevisionAgente>("/agentes/interpretar", "POST", { texto: orden, conversacionId: conversacionId.current, contexto: contextoAgente(), ...(anterior ? { anterior: anterior.instruccion, id: anterior.id, version: anterior.version + 1 } : {}) }).catch(error => {
        if (turno === generacion.current) { detenerMicrofono.current?.(); detenerMicrofono.current = null; setEscuchando(false); }
        throw new Error(`${error instanceof Error ? error.message : "No se pudo interpretar"}. El texto se conserva; toca el robot y vuelve a dictar la corrección`);
      });
      if (turno !== generacion.current || revisionAgente() !== anterior || agenteGuardando()) return;
      cambiarRevisionAgente(resultado); setMensaje(resultado.resumen + (resultado.conexion?.respaldo ? ` · Respondió el respaldo: ${resultado.conexion.proveedor}` : "")); setTexto(orden); navegar(resultado.ruta);
      if (estado && vozActiva.current) hablar(resultado.resumen, estado.audio);
    });
  }
  useEffect(() => { interpretarActual.current = interpretar; });
  useEffect(() => {
    const actualizar = (e: Event) => { hablandoActual.current = Boolean((e as CustomEvent<boolean>).detail); setHablando(hablandoActual.current); };
    window.addEventListener("synchronic:agente-hablando", actualizar);
    return () => window.removeEventListener("synchronic:agente-hablando", actualizar);
  }, []);
  async function alternarMicrofono() {
    setAbierto(true);
    if (escuchando || iniciando.current) {
      generacionAudio.current++; detenerMicrofono.current?.(); detenerMicrofono.current = null;
      iniciando.current = false; setEscuchando(false); setMensaje("Micrófono desactivado · sigo procesando tu instrucción"); return;
    }
    const turno = generacionAudio.current;
    if (!window.AudioContext) { setMensaje("Este navegador no permite capturar audio. Prueba con Chrome, Edge o Safari actualizado"); return; }
    iniciando.current = true;
    const contextoAudio = new AudioContext();
    void contextoAudio.resume().catch(() => {});
    let transferido = false;
    try {
      const configuracion = estado?.habilitado && estado.configurado ? estado : await api<Estado>("/agentes/estado");
      if (turno !== generacionAudio.current) return;
      setEstado(configuracion);
      if (!configuracion.habilitado || !configuracion.configurado) throw new Error("Habilita y configura el asistente en Configuración");
      if (configuracion.modo === "live") throw new Error("Selecciona el modo híbrido para usar este micrófono");
      vozActiva.current = true;
      transferido = true;
      const detener = await abrirMicrofono(valor => {
        if (turno !== generacionAudio.current || bloqueo.current || agenteGuardando()) return;
        setTexto(valor); void interpretarActual.current(valor);
      }, aviso => {
        if (turno !== generacionAudio.current) return;
        setMensaje(aviso); if (aviso === "Micrófono desconectado") setEscuchando(false);
      }, detener => { if (turno !== generacionAudio.current) detener(); else detenerMicrofono.current = detener; },
      () => bloqueo.current || agenteGuardando() || hablandoActual.current, valor => { if (turno === generacionAudio.current && !bloqueo.current) setTexto(valor); },
      nivel => { robot.current?.style.setProperty("--nivel", String(nivel)); }, contextoAudio);
      if (turno !== generacionAudio.current) { detener(); return; }
      detenerMicrofono.current = detener; setEscuchando(true);
      const saludo = "Hola, soy el asistente de Synchronic.JO. Puedes decirme la operación completa.";
      setMensaje(saludo); hablar(saludo, configuracion.audio);
    } catch (error) {
      if (turno === generacionAudio.current) setMensaje(error instanceof Error ? error.message : "No se pudo activar el micrófono");
    } finally {
      if (!transferido) void contextoAudio.close().catch(() => {});
      if (turno === generacionAudio.current) { iniciando.current = false; if (!bloqueo.current) setOcupado(false); }
    }
  }
  function apagarAgente() {
    generacion.current++; generacionAudio.current++; vozActiva.current = false;
    detenerMicrofono.current?.(); detenerMicrofono.current = null; iniciando.current = false;
    bloqueo.current = false; setOcupado(false); setEscuchando(false); setHablando(false); setAbierto(false);
    window.speechSynthesis?.cancel();
  }
  if (!usuario || usuario.rol === "inventario" || !usaApi) return null;
  return <RobotAsistente abierto={abierto} escuchando={escuchando} hablando={hablando} ocupado={ocupado} robotRef={robot} ancho={ancho} cerrarBurbuja={() => setAbierto(false)} alternar={() => void alternarMicrofono()} apagar={apagarAgente}>
    <section style={{ width: ancho }} className="max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line/50 bg-paper-raised/80 px-3 py-2 shadow-md backdrop-blur-md">
      <span className="text-[10px] text-ink-soft">{ocupado ? "Preparando detalle…" : hablando ? "Respondiendo" : escuchando ? "Te escucho · toca el robot para detener" : "Toca el robot para hablar"}</span>
      <p aria-label="Texto reconocido" className="mt-1 line-clamp-2 min-h-8 text-xs" aria-live="polite">{texto || mensaje || "Aquí aparece lo que dictas"}</p>
      {mensaje && texto && <p role="status" className="mt-1 line-clamp-2 text-[11px] text-ink-soft">{mensaje}</p>}
      <input aria-label="Ancho del texto del asistente" title="Ajustar ancho" type="range" min="200" max="440" step="10" value={ancho} onChange={e => { const valor = Number(e.target.value); setAncho(valor); localStorage.setItem("ambie:ui:ancho-asistente", String(valor)); }} className="mt-1 block h-2 w-full accent-teal" />
    </section>
  </RobotAsistente>;
}
