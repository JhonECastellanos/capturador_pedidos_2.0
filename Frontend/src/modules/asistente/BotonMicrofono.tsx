import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { accionesParaRol, comandoVoz, esAccionAsistente, IntencionAsistenteEsquema, prepararOperacionAsistente, rutaAsistente, type ConfiguracionAsistentePublica, type EventoVoz, type IntencionAsistente, type RolUsuario } from "@ambie/contrato";
import { api, usaApi } from "../../data/api";
import { useAuth } from "../../context/auth";
import { useOperaciones } from "../../context/operaciones";
import { ProductoVozAmbiguo, resolverProductoVoz, resolverDatosIntencion, resolverReferencia, resumenIntencion, respuestaHablada } from "./intencion";
import { limitarPosicion, SesionVoz } from "./sesion-voz";
import { pasoConversacion } from "./conversacion";
import { prepararSonidos, sonar } from "./sonidos";
import { despuesDePintar, pantallaVoz } from "./pantalla-voz";

export function AsistenteVoz() {
  const { usuario } = useAuth();
  return usuario && usaApi ? <Microfono key={usuario.id} rol={usuario.rol} /> : null;
}
function Microfono({ rol }: { rol: RolUsuario }) {
  const navegar = useNavigate(), datos = useOperaciones(), ubicacion = useLocation();
  const [activo, setActivo] = useState(false), [estado, setEstado] = useState("apagado"), [mensaje, setMensaje] = useState(""), [nivel, setNivel] = useState(0);
  const [posicion, setPosicion] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem("ambie:ui:microfono") || "null"); if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return limitarPosicion(p.x, p.y); } catch {}
    return limitarPosicion(window.innerWidth - 72, window.innerHeight - 155);
  });
  const sesion = useRef<SesionVoz | null>(null), ocupado = useRef(false), vigente = useRef(true), generacion = useRef(0);
  const pendiente = useRef<IntencionAsistente | null>(null), campo = useRef(""), firma = useRef("");
  const aclaracion = useRef<{ orden: IntencionAsistente; indice: number; opciones: Array<{ id: string; nombre: string }> } | null>(null);
  const salida = useRef<SpeechSynthesisUtterance | null>(null), recibirRef = useRef<(e: EventoVoz) => void>(() => undefined);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferencias = useRef({ vozHabilitada: true, confirmacionVoz: true, responderConVoz: true, proveedor: "basico" as ConfiguracionAsistentePublica["proveedor"] });
  const arrastre = useRef<{ x: number; y: number; origenX: number; origenY: number; movido: boolean } | null>(null);
  function limpiar() { pendiente.current = null; aclaracion.current = null; firma.current = ""; campo.current = ""; }
  function reanudar() { if (vigente.current && !ocupado.current) { sesion.current?.pausar(false); setEstado(sesion.current ? firma.current ? "listo para confirmar" : "escuchando" : "apagado"); } }
  function detener() { generacion.current++; sesion.current?.cerrar(); sesion.current = null; limpiar(); setActivo(false); setEstado("apagado"); setNivel(0); window.dispatchEvent(new Event("ambie:voz-detenida")); if (salida.current) window.speechSynthesis.cancel(); salida.current = null; }
  function mostrarMensaje(texto: string) { if (temporizador.current) clearTimeout(temporizador.current); setMensaje(texto); temporizador.current = setTimeout(() => { if (vigente.current) setMensaje(""); }, 3500); }
  function responder(texto: string) {
    if (!vigente.current || !sesion.current) return;
    mostrarMensaje(texto); sesion.current.pausar(true);
    if (salida.current) window.speechSynthesis.cancel(); salida.current = null;
    const voz = "speechSynthesis" in window ? window.speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith("es")) : undefined;
    if (!preferencias.current.responderConVoz || !voz) { reanudar(); return; }
    const frase = new SpeechSynthesisUtterance(respuestaHablada(texto)); frase.voice = voz; frase.lang = voz.lang; frase.rate = 1.08; salida.current = frase;
    frase.onend = frase.onerror = () => { if (salida.current === frase) { salida.current = null; reanudar(); } }; window.speechSynthesis.speak(frase);
  }
  useEffect(() => {
    vigente.current = true;
    const cargar = () => void api<typeof preferencias.current>("/asistente/preferencias").then(p => { if (!vigente.current) return; preferencias.current = { ...preferencias.current, ...p }; if (!p.vozHabilitada) detener(); }).catch(() => undefined);
    const ajustar = () => setPosicion(p => limitarPosicion(p.x, p.y)); const ocultar = () => { if (document.hidden) detener(); };
    cargar(); window.addEventListener("resize", ajustar); window.addEventListener("ambie:asistente-configurado", cargar); document.addEventListener("visibilitychange", ocultar);
    return () => { vigente.current = false; generacion.current++; sesion.current?.cerrar(); if (temporizador.current) clearTimeout(temporizador.current); if (salida.current) window.speechSynthesis.cancel(); window.removeEventListener("resize", ajustar); window.removeEventListener("ambie:asistente-configurado", cargar); document.removeEventListener("visibilitychange", ocultar); };
  }, []);
  useEffect(() => { try { localStorage.setItem("ambie:ui:microfono", JSON.stringify(posicion)); } catch {} }, [posicion]);
  function ruta(orden: IntencionAsistente) {
    const vendedor = rol === "vendedor";
    if (orden.accion === "crear_pedido") return vendedor ? "/vendedor/pedido" : "/admin/ventas/pedido";
    if (orden.accion === "crear_cliente") return vendedor ? "/vendedor/clientes/nuevo" : "/admin/ventas/clientes/nuevo";
    if (orden.accion === "recibir_abono") return vendedor ? "/vendedor/abonos" : "/admin/creditos";
    if (/usuario/.test(orden.accion || "")) return "/admin/usuarios";
    if (/compra|proveedor|gasto/.test(orden.accion || "")) return "/admin/compras";
    if (orden.accion === "cambiar_precio") return "/admin/precios";
    if (/cierre|trasladar/.test(orden.accion || "")) return "/admin/cierre";
    if (orden.accion === "registrar_egreso") return "/admin/caja";
    if (/pedido/.test(orden.accion || "")) { const id = resolverReferencia(orden.payload.pedidoId, datos.pedidos.map(p => ({ id: p.id, nombre: p.numero }))); return id ? `${vendedor ? "/vendedor" : "/admin/ventas"}/pedido/${encodeURIComponent(id)}` : vendedor ? "/vendedor" : "/admin/pedidos"; }
    return "/admin/inventario";
  }
  async function mostrar(orden: IntencionAsistente, turno: number) {
    firma.current = "";
    if (orden.destino) { const destino = rutaAsistente(orden.destino, rol); if (!destino) throw new Error("No tienes permisos para abrir esa sección."); limpiar(); navegar(destino); responder(orden.mensaje); return; }
    if (!orden.accion || !esAccionAsistente(orden.accion)) { responder(orden.mensaje); return; }
    if (!accionesParaRol(rol).includes(orden.accion)) throw new Error("No tienes permisos para esta operación.");
    const accion = orden.accion;
    try {
      const payload = Object.fromEntries(Object.entries(orden.payload).filter(([, v]) => v !== ""));
      if (Array.isArray(payload.lineas)) for (let i = 0; i < payload.lineas.length; i++) {
        const linea = payload.lineas[i] as Record<string, unknown>;
        try { resolverProductoVoz(linea.productoId, datos.inventario.filter(p => p.activo)); }
        catch (e) { if (e instanceof ProductoVozAmbiguo) aclaracion.current = { orden, indice: i, opciones: e.opciones }; throw e; }
      }
      orden = { ...orden, payload: resolverDatosIntencion(payload, datos) };
      if (accion === "crear_pedido" && Array.isArray(orden.payload.lineas)) {
        const cantidades = new Map<string, number>();
        for (const linea of orden.payload.lineas as Array<{ productoId: string; cantidad: number }>) cantidades.set(linea.productoId, (cantidades.get(linea.productoId) ?? 0) + linea.cantidad);
        for (const [id, cantidad] of cantidades) { const producto = datos.inventario.find(p => p.id === id); if (producto && cantidad > producto.stock) throw new Error(`Solo hay ${producto.stock} unidades de ${producto.nombre}. Corrige la cantidad; no se modificó el formulario.`); }
      }
    } catch (e) { pendiente.current = orden; if (e instanceof ProductoVozAmbiguo && !aclaracion.current) aclaracion.current = { orden, indice: -1, opciones: e.opciones }; throw e; }
    aclaracion.current = null; pendiente.current = orden;
    const paso = pasoConversacion(orden, rol, datos); campo.current = paso?.campo ?? "";
    const destino = ruta(orden); if (ubicacion.pathname !== destino) navegar(destino);
    await despuesDePintar(); let pantalla = await pantallaVoz(accion);
    if (turno !== generacion.current || !sesion.current || !vigente.current) return;
    if (!pantalla) { responder("Completa la operación con los controles de esta pantalla."); return; }
    pantalla.aplicar(orden.payload, campo.current); await despuesDePintar();
    const montada = await pantallaVoz(accion);
    if (turno !== generacion.current || !sesion.current) return;
    if (montada && montada !== pantalla) { pantalla = montada; pantalla.aplicar(orden.payload, campo.current); await despuesDePintar(); }
    if (paso) { responder(paso.pregunta); return; }
    const actual = pantalla.leer(); prepararOperacionAsistente(accion, actual, rol);
    firma.current = JSON.stringify(actual); sonar("listo"); responder(resumenIntencion(accion, actual, datos) + " Di confirma para guardar.");
  }
  async function confirmar() {
    const orden = pendiente.current;
    if (!orden?.accion || !esAccionAsistente(orden.accion) || aclaracion.current || !firma.current) { responder("Completa y revisa la operación antes de confirmar."); return; }
    if (!preferencias.current.confirmacionVoz) { responder("Confirma con el botón de esta pantalla."); return; }
    const pantalla = await pantallaVoz(orden.accion); if (!pantalla) { limpiar(); responder("La operación ya no está abierta."); return; }
    const actual = pantalla.leer(); prepararOperacionAsistente(orden.accion, actual, rol);
    if (firma.current !== JSON.stringify(actual)) { await mostrar({ ...orden, payload: actual }, generacion.current); return; }
    firma.current = ""; setEstado("procesando"); sonar("procesando");
    if (await pantalla.confirmar()) { limpiar(); sonar("guardado"); responder(orden.accion === "crear_pedido" ? "Pedido confirmado. ¿Otro pedido?" : "Operación guardada."); }
    else { sonar("error"); responder("No se guardó. Revisa el aviso de la pantalla."); }
  }
  async function recibir(evento: EventoVoz) {
    if (!vigente.current) return;
    if (evento.tipo === "error") { detener(); mostrarMensaje(evento.mensaje); return; }
    if (evento.tipo !== "final" || !evento.texto || ocupado.current || salida.current || !sesion.current) return;
    if (evento.confianza < .65) { responder("No escuché con claridad. Repite la instrucción completa."); return; }
    ocupado.current = true; setEstado("procesando"); sesion.current.pausar(true); const turno = generacion.current;
    try {
      const comando = comandoVoz(evento.texto, evento.confianza);
      const frase = evento.texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[.!?]+$/, "");
      if (comando === "confirmar") { await confirmar(); return; }
      if (comando === "cancelar") { const orden = pendiente.current; if (orden?.accion && esAccionAsistente(orden.accion)) (await pantallaVoz(orden.accion))?.cancelar(); limpiar(); responder("Operación cancelada. No se guardó."); return; }
      if (/^(revisar|revisar operacion|continuar)$/.test(frase) && pendiente.current?.accion && esAccionAsistente(pendiente.current.accion)) { const pantalla = await pantallaVoz(pendiente.current.accion); if (pantalla) await mostrar({ ...pendiente.current, payload: pantalla.leer() }, turno); return; }
      if (/^(volver|atras|regresar|paso anterior)$/.test(frase)) { firma.current = ""; const orden = pendiente.current; const pantalla = orden?.accion && esAccionAsistente(orden.accion) ? await pantallaVoz(orden.accion) : null; if (pantalla?.volver) pantalla.volver(); else navegar(-1); responder("Volvimos. Puedes corregir los datos."); return; }
      const duda = aclaracion.current;
      if (duda) { const id = resolverProductoVoz(evento.texto, duda.opciones); const payload = { ...duda.orden.payload }; if (duda.indice < 0) payload.productoId = id; else payload.lineas = (payload.lineas as Array<Record<string, unknown>>).map((l, i) => i === duda.indice ? { ...l, productoId: id } : l); await mostrar({ ...duda.orden, payload }, turno); return; }
      let orden = pendiente.current;
      if (orden?.accion && esAccionAsistente(orden.accion) && firma.current) { const actual = (await pantallaVoz(orden.accion))?.leer(); if (actual) orden = { ...orden, payload: actual }; }
      setEstado("procesando"); sonar("procesando"); firma.current = "";
      const segura = orden ? { ...orden, payload: Object.fromEntries(Object.entries(orden.payload).filter(([k]) => k !== "password")) } : undefined;
      const ids = new Set(Array.isArray(segura?.payload.lineas) ? segura.payload.lineas.map(l => (l as Record<string, unknown>).productoId) : []);
      const nombres = Object.fromEntries(datos.inventario.filter(p => ids.has(p.id)).slice(0, 60).map(p => [p.id, p.nombre]));
      const respuesta = IntencionAsistenteEsquema.parse(await api("/asistente/entender", "POST", { texto: evento.texto, pendiente: segura, campo: campo.current || undefined, nombres }));
      if (turno !== generacion.current || !sesion.current || !vigente.current) return;
      await mostrar(respuesta, turno);
    } catch (e) { if (turno === generacion.current) { sonar("error"); responder(e instanceof Error ? e.message : "No se pudo completar la operación."); } }
    finally { ocupado.current = false; if (!salida.current) reanudar(); }
  }
  useEffect(() => { recibirRef.current = e => void recibir(e); });
  async function activar() {
    if (sesion.current) { detener(); return; } if (ocupado.current) return; prepararSonidos();
    if (!preferencias.current.vozHabilitada) { mostrarMensaje("El administrador desactivó la voz."); return; }
    ocupado.current = true; setActivo(true); setEstado("escuchando");
    const nueva = new SesionVoz(e => recibirRef.current(e), n => setNivel(n)); sesion.current = nueva;
    try { await nueva.iniciar(); if (sesion.current === nueva) responder("Te escucho. Dime qué quieres hacer."); } catch (e) { detener(); mostrarMensaje(e instanceof Error ? e.message : "No se pudo activar el micrófono."); } finally { ocupado.current = false; if (!salida.current) reanudar(); }
  }
  function iniciarArrastre(e: PointerEvent<HTMLButtonElement>) { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); arrastre.current = { x: e.clientX, y: e.clientY, origenX: posicion.x, origenY: posicion.y, movido: false }; }
  function mover(e: PointerEvent<HTMLButtonElement>) { const a = arrastre.current; if (!a) return; const dx = e.clientX - a.x, dy = e.clientY - a.y; if (Math.hypot(dx, dy) > 6) a.movido = true; if (a.movido) setPosicion(limitarPosicion(a.origenX + dx, a.origenY + dy)); }
  const estilo = { left: posicion.x, top: posicion.y, touchAction: "none", "--nivel-voz": Math.min(1, nivel * 8) } as CSSProperties;
  return <>
    <button type="button" aria-pressed={activo} aria-label={`Asistente de voz, ${estado}. Toca para ${activo ? "apagar" : "hablar"}. Arrastra para mover.`} title={mensaje || "Toca para hablar"} style={estilo} className={`microfono-flotante ${activo ? "microfono-activo" : ""}`} onPointerDown={iniciarArrastre} onPointerMove={mover} onPointerUp={e => { const a = arrastre.current; arrastre.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (a && !a.movido) void activar(); }} onPointerCancel={() => { arrastre.current = null; }} onClick={e => { if (e.detail === 0) void activar(); }} onKeyDown={e => { const d = ({ ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] } as Record<string, number[]>)[e.key]; if (d) { e.preventDefault(); setPosicion(p => limitarPosicion(p.x + d[0], p.y + d[1])); } }}>
      <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg><span className="microfono-ondas" aria-hidden="true"><i /><i /><i /></span>
    </button>
    {mensaje && <output role="status" aria-live="polite" className="asistente-subtitulo"><span className="line-clamp-2">{mensaje}</span></output>}
  </>;
}
