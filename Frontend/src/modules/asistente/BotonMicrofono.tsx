import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { accionesParaRol, comandoVoz, esAccionAsistente, IntencionAsistenteEsquema, prepararOperacionAsistente, rutaAsistente, type EventoVoz, type IntencionAsistente, type RolUsuario } from "@ambie/contrato";
import { api, usaApi } from "../../data/api";
import { useAuth } from "../../context/auth";
import { useOperaciones } from "../../context/operaciones";
import { resolverReferencia, resumenIntencion } from "./intencion";
import { limitarPosicion, SesionVoz } from "./sesion-voz";
import { pasoConversacion } from "./conversacion";
import { prepararSonidos, sonar } from "./sonidos";
import { despuesDePintar, pantallaVoz } from "./pantalla-voz";

export function AsistenteVoz() {
  const { usuario } = useAuth();
  return usuario && usaApi ? <Microfono key={usuario.id} rol={usuario.rol} /> : null;
}
function Microfono({ rol }: { rol: RolUsuario }) {
  const navegar = useNavigate(), datos = useOperaciones();
  const [activo, setActivo] = useState(false), [estado, setEstado] = useState("apagado"), [mensaje, setMensaje] = useState(""), [nivel, setNivel] = useState(0);
  const [posicion, setPosicion] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem("ambie:ui:microfono") || "null"); if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return limitarPosicion(p.x, p.y); } catch {}
    return limitarPosicion(window.innerWidth - 72, window.innerHeight - 155);
  });
  const sesion = useRef<SesionVoz | null>(null), ocupado = useRef(false), vigente = useRef(true), pendiente = useRef<IntencionAsistente | null>(null), campo = useRef(""), firma = useRef("");
  const salida = useRef<SpeechSynthesisUtterance | null>(null), recibirRef = useRef<(e: EventoVoz) => void>(() => undefined);
  const preferencias = useRef({ vozHabilitada: true, confirmacionVoz: true, responderConVoz: true });
  const arrastre = useRef<{ x: number; y: number; origenX: number; origenY: number; movido: boolean } | null>(null);
  function reanudar() { if (vigente.current) { sesion.current?.pausar(false); setEstado(sesion.current ? "escuchando" : "apagado"); } }
  function detener() { sesion.current?.cerrar(); sesion.current = null; pendiente.current = null; firma.current = ""; campo.current = ""; setActivo(false); setEstado("apagado"); setNivel(0); if (salida.current) window.speechSynthesis.cancel(); salida.current = null; }
  function responder(texto: string) {
    if (!vigente.current) return;
    setMensaje(texto); sesion.current?.pausar(true);
    if (salida.current) window.speechSynthesis.cancel(); salida.current = null;
    const voz = "speechSynthesis" in window ? window.speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith("es")) : undefined;
    if (!preferencias.current.responderConVoz || !voz) { reanudar(); return; }
    const frase = new SpeechSynthesisUtterance(texto); frase.voice = voz; frase.lang = voz.lang; salida.current = frase; setEstado("hablando");
    frase.onend = frase.onerror = () => { if (salida.current === frase) { salida.current = null; reanudar(); } }; window.speechSynthesis.speak(frase);
  }
  useEffect(() => {
    vigente.current = true;
    const cargar = () => void api<typeof preferencias.current>("/asistente/preferencias").then(p => { preferencias.current = p; if (!p.vozHabilitada) detener(); }).catch(() => undefined);
    const ajustar = () => setPosicion(p => limitarPosicion(p.x, p.y));
    const ocultar = () => { if (document.hidden) detener(); };
    cargar(); window.addEventListener("resize", ajustar); window.addEventListener("ambie:asistente-configurado", cargar); document.addEventListener("visibilitychange", ocultar);
    return () => { vigente.current = false; sesion.current?.cerrar(); if (salida.current) window.speechSynthesis.cancel(); window.removeEventListener("resize", ajustar); window.removeEventListener("ambie:asistente-configurado", cargar); document.removeEventListener("visibilitychange", ocultar); };
  }, []);
  useEffect(() => { try { localStorage.setItem("ambie:ui:microfono", JSON.stringify(posicion)); } catch {} }, [posicion]);
  function ruta(orden: IntencionAsistente) {
    const vendedor = rol === "vendedor";
    if (orden.accion === "crear_pedido") return vendedor ? "/vendedor/pedido" : "/admin/ventas/pedido";
    if (orden.accion === "crear_cliente") return vendedor ? "/vendedor/clientes/nuevo" : "/admin/ventas/clientes/nuevo";
    if (orden.accion === "recibir_abono") return vendedor ? "/vendedor/abonos" : "/admin/ventas/abonos";
    if (/usuario/.test(orden.accion || "")) return "/admin/usuarios";
    if (/compra|proveedor|gasto/.test(orden.accion || "")) return "/admin/compras";
    if (orden.accion === "cambiar_precio") return "/admin/precios";
    if (orden.accion === "registrar_cierre") return "/admin/cierre";
    if (orden.accion === "trasladar_pedido") return "/admin/cierre";
    if (orden.accion === "registrar_egreso") return "/admin/caja";
    if (/pedido/.test(orden.accion || "")) {
      const id = resolverReferencia(orden.payload.pedidoId, datos.pedidos.map(p => ({ id: p.id, nombre: p.numero })));
      return id ? `/admin/ventas/pedido/${encodeURIComponent(id)}` : "/admin/ventas";
    }
    return "/admin/inventario";
  }
  async function mostrar(orden: IntencionAsistente) {
    if (orden.accion === "crear_pedido" && Array.isArray(orden.payload.lineas)) {
      const unificadas = new Map<string, { productoId: string; cantidad: number }>();
      let completas = true;
      for (const l of orden.payload.lineas) {
        if (!l || typeof l !== "object" || Array.isArray(l) || typeof l.cantidad !== "number") { completas = false; break; }
        const id = resolverReferencia(l.productoId, datos.inventario);
        if (!id) { completas = false; break; }
        unificadas.set(id, { productoId: id, cantidad: (unificadas.get(id)?.cantidad ?? 0) + l.cantidad });
      }
      if (completas) orden = { ...orden, payload: { ...orden.payload, lineas: [...unificadas.values()] } };
    }
    pendiente.current = orden; firma.current = "";
    if (orden.destino) { const destino = rutaAsistente(orden.destino, rol); if (destino) navegar(destino); pendiente.current = null; responder(orden.mensaje); return; }
    if (!orden.accion || !esAccionAsistente(orden.accion)) { responder(orden.mensaje); return; }
    const paso = pasoConversacion(orden, rol, datos); campo.current = paso?.campo || ""; navegar(ruta(orden));
    await despuesDePintar();
    let pantalla = await pantallaVoz(orden.accion);
    if (!vigente.current || !sesion.current) return;
    if (!pantalla) { responder("Completa esta operación con los controles de esta pantalla. No guardaré nada por fuera del aplicativo."); return; }
    pantalla.aplicar(orden.payload, campo.current); await despuesDePintar();
    const montada = await pantallaVoz(orden.accion);
    if (montada && montada !== pantalla) { pantalla = montada; pantalla.aplicar(orden.payload, campo.current); await despuesDePintar(); }
    if (paso) { responder(paso.pregunta); return; }
    try {
      const actual = pantalla.leer(); prepararOperacionAsistente(orden.accion, actual, rol); firma.current = JSON.stringify(actual);
      sonar("listo"); responder(resumenIntencion(orden.accion, actual, datos) + " Revisa la pantalla. Di confirmar operación para guardar o cancelar operación para descartar.");
    } catch { responder("Completa los campos de esta pantalla. Después di revisar operación."); }
  }
  async function confirmar() {
    const orden = pendiente.current;
    if (!orden?.accion || !esAccionAsistente(orden.accion) || !firma.current) { responder("Primero completa los datos y di revisar operación."); return; }
    if (!preferencias.current.confirmacionVoz) { responder("Confirma con el botón de esta pantalla."); return; }
    const pantalla = await pantallaVoz(orden.accion);
    if (!pantalla) { responder("Abre de nuevo la operación antes de confirmar."); return; }
    const actual = pantalla.leer();
    if (firma.current !== JSON.stringify(actual)) { firma.current = ""; await mostrar({ ...orden, payload: actual as IntencionAsistente["payload"] }); return; }
    prepararOperacionAsistente(orden.accion, actual, rol); firma.current = ""; setEstado("guardando"); sonar("procesando");
    if (await pantalla.confirmar()) { pendiente.current = null; sonar("guardado"); responder("La operación quedó guardada. Puedes pedir otra operación."); }
    else { sonar("error"); responder("No se guardó. Revisa el aviso y los datos de la pantalla."); }
  }
  async function recibir(evento: EventoVoz) {
    if (!vigente.current) return;
    if (evento.tipo === "error") { detener(); setMensaje(evento.mensaje); return; }
    if (evento.tipo !== "final" || !evento.texto || ocupado.current || salida.current) return;
    if (evento.confianza < .65) { responder("No escuché con claridad. Repite la frase."); return; }
    ocupado.current = true; sesion.current?.pausar(true);
    try {
      const comando = comandoVoz(evento.texto, evento.confianza);
      if (comando === "confirmar") { await confirmar(); return; }
      if (comando === "cancelar") {
        const orden = pendiente.current; if (orden?.accion && esAccionAsistente(orden.accion)) (await pantallaVoz(orden.accion))?.cancelar();
        pendiente.current = null; firma.current = ""; responder("Operación descartada. No se guardaron cambios."); return;
      }
      const orden = pendiente.current;
      const quitar = /^(?:quita|quitar|elimina|eliminar|borra|borrar)\s+(?:el producto\s+)?(.+)$/i.exec(evento.texto.trim());
      if (orden?.accion === "crear_pedido" && quitar && Array.isArray(orden.payload.lineas)) {
        const id = resolverReferencia(quitar[1], datos.inventario);
        if (!id) { responder("Selecciona el producto que quieres quitar en la pantalla."); return; }
        const lineas = orden.payload.lineas.filter(l => l && typeof l === "object" && !Array.isArray(l) && resolverReferencia(l.productoId, datos.inventario) !== id);
        await mostrar({ ...orden, payload: { ...orden.payload, lineas } }); return;
      }
      if (/^revisar operaci[oó]n$/i.test(evento.texto) && orden?.accion && esAccionAsistente(orden.accion)) {
        const pantalla = await pantallaVoz(orden.accion); if (pantalla) await mostrar({ ...orden, payload: pantalla.leer() as IntencionAsistente["payload"] }); return;
      }
      setEstado("procesando"); sonar("procesando");
      const segura = orden ? { ...orden, payload: Object.fromEntries(Object.entries(orden.payload).filter(([k]) => k !== "password")) } : undefined;
      const respuesta = IntencionAsistenteEsquema.parse(await api("/asistente/entender", "POST", { texto: evento.texto, pendiente: segura, campo: campo.current || undefined }));
      if (respuesta.accion && (!esAccionAsistente(respuesta.accion) || !accionesParaRol(rol).includes(respuesta.accion))) throw new Error("No tienes permisos para esta operación.");
      await mostrar(respuesta);
    } catch (e) { sonar("error"); responder(e instanceof Error ? e.message : "No se pudo completar la operación."); }
    finally { ocupado.current = false; if (!salida.current) reanudar(); }
  }
  useEffect(() => { recibirRef.current = e => void recibir(e); });
  async function activar() {
    if (sesion.current) { detener(); return; }
    if (ocupado.current) return; prepararSonidos();
    if (!preferencias.current.vozHabilitada) { setMensaje("El administrador desactivó la voz."); return; }
    ocupado.current = true; setActivo(true); setEstado("conectando");
    const nueva = new SesionVoz(e => recibirRef.current(e), n => setNivel(n)); sesion.current = nueva;
    try { await nueva.iniciar(); if (sesion.current === nueva) responder("Te escucho. Dime qué quieres hacer."); }
    catch (e) { detener(); setMensaje(e instanceof Error ? e.message : "No se pudo activar el micrófono."); }
    finally { ocupado.current = false; }
  }
  function iniciarArrastre(e: PointerEvent<HTMLButtonElement>) { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); arrastre.current = { x: e.clientX, y: e.clientY, origenX: posicion.x, origenY: posicion.y, movido: false }; }
  function mover(e: PointerEvent<HTMLButtonElement>) { const a = arrastre.current; if (!a) return; const dx = e.clientX - a.x, dy = e.clientY - a.y; if (Math.hypot(dx, dy) > 6) a.movido = true; if (a.movido) setPosicion(limitarPosicion(a.origenX + dx, a.origenY + dy)); }
  const estilo = { left: posicion.x, top: posicion.y, touchAction: "none", "--nivel-voz": Math.min(1, nivel * 8) } as CSSProperties;
  return <>
    <button type="button" aria-pressed={activo} aria-label={`Asistente de voz, ${estado}. Toca para ${activo ? "apagar" : "hablar"}. Arrastra para mover.`} title={mensaje || "Toca para hablar"} style={estilo} className={`microfono-flotante ${activo ? "microfono-activo" : ""}`} onPointerDown={iniciarArrastre} onPointerMove={mover} onPointerUp={e => { const a = arrastre.current; arrastre.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (a && !a.movido) void activar(); }} onPointerCancel={() => { arrastre.current = null; }} onClick={e => { if (e.detail === 0) void activar(); }} onKeyDown={e => { const d = ({ ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] } as Record<string, number[]>)[e.key]; if (d) { e.preventDefault(); setPosicion(p => limitarPosicion(p.x + d[0], p.y + d[1])); } }}>
      <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg><span className="microfono-ondas" aria-hidden="true"><i /><i /><i /></span>
    </button>
    {mensaje && <output role="status" aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-[74] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-line bg-paper-raised px-3 py-2 text-xs text-ink shadow-sm">{mensaje}</output>}
  </>;
}
