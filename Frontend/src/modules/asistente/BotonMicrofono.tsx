import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { accionesParaRol, comandoVoz, esAccionAsistente, IntencionAsistenteEsquema, numeroHablado, prepararOperacionAsistente, productosHablados, rutaAsistente, type ConfiguracionAsistentePublica, type EventoVoz, type IntencionAsistente, type RolUsuario } from "@ambie/contrato";
import { api, usaApi } from "../../data/api";
import { useAuth } from "../../context/auth";
import { useOperaciones } from "../../context/operaciones";
import { ProductoVozAmbiguo, resolverProductoVoz, resolverReferencia, resumenIntencion, respuestaHablada, totalIntencion } from "./intencion";
import { limitarPosicion, SesionVoz } from "./sesion-voz";
import { campoAnteriorConversacion, camposConversacion, firmaProductosVoz, pasoConversacion, preguntaCampo } from "./conversacion";
import { prepararSonidos, sonar } from "./sonidos";
import { despuesDePintar, pantallaVoz } from "./pantalla-voz";

export function AsistenteVoz() {
  const { usuario } = useAuth();
  return usuario && usaApi ? <Microfono key={usuario.id} rol={usuario.rol} /> : null;
}
function Microfono({ rol }: { rol: RolUsuario }) {
  const navegar = useNavigate(), datos = useOperaciones();
  const ubicacion = useLocation();
  const clienteConfirmado = useRef<string | null>(null);
  const productosConfirmados = useRef("");
  const aclaracionProducto = useRef<{ orden: IntencionAsistente; indice: number; opciones: Array<{ id: string; nombre: string }>; campoForzado?: string } | null>(null);
  const temporizadorMensaje = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cantidadProducto = useRef<string | null>(null);
  const clienteEvento = useRef<(id: string | null, confirmado: boolean) => Promise<void>>(async () => {});
  const pasoEvento = useRef<(campo: string) => Promise<void>>(async () => {});
  const [activo, setActivo] = useState(false), [estado, setEstado] = useState("apagado"), [mensaje, setMensaje] = useState(""), [nivel, setNivel] = useState(0);
  const [posicion, setPosicion] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem("ambie:ui:microfono") || "null"); if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return limitarPosicion(p.x, p.y); } catch {}
    return limitarPosicion(window.innerWidth - 72, window.innerHeight - 155);
  });
  const sesion = useRef<SesionVoz | null>(null), ocupado = useRef(false), vigente = useRef(true), pendiente = useRef<IntencionAsistente | null>(null), campo = useRef(""), firma = useRef("");
  const salida = useRef<SpeechSynthesisUtterance | null>(null), recibirRef = useRef<(e: EventoVoz) => void>(() => undefined);
  const preferencias = useRef({ vozHabilitada: true, confirmacionVoz: true, responderConVoz: true, proveedor: "basico" as ConfiguracionAsistentePublica["proveedor"] });
  const arrastre = useRef<{ x: number; y: number; origenX: number; origenY: number; movido: boolean } | null>(null);
  function reanudar() { if (vigente.current) { sesion.current?.pausar(false); setEstado(sesion.current ? "escuchando" : "apagado"); } }
  function detener() { sesion.current?.cerrar(); sesion.current = null; pendiente.current = null; aclaracionProducto.current = null; cantidadProducto.current = null; clienteConfirmado.current = null; productosConfirmados.current = ""; firma.current = ""; campo.current = ""; setActivo(false); setEstado("apagado"); setNivel(0); window.dispatchEvent(new Event("ambie:voz-detenida")); if (salida.current) window.speechSynthesis.cancel(); salida.current = null; }
  function mostrarMensaje(texto: string) {
    if (temporizadorMensaje.current) clearTimeout(temporizadorMensaje.current);
    setMensaje(texto);
    temporizadorMensaje.current = setTimeout(() => { if (vigente.current) setMensaje(""); temporizadorMensaje.current = null; }, 3500);
  }
  function responder(texto: string) {
    if (!vigente.current) return;
    mostrarMensaje(texto); sesion.current?.pausar(true);
    if (salida.current) window.speechSynthesis.cancel(); salida.current = null;
    const voz = "speechSynthesis" in window ? window.speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith("es")) : undefined;
    if (!preferencias.current.responderConVoz || !voz) { reanudar(); return; }
    const frase = new SpeechSynthesisUtterance(respuestaHablada(texto)); frase.voice = voz; frase.lang = voz.lang; frase.rate = 1.08; salida.current = frase; setEstado("hablando");
    frase.onend = frase.onerror = () => { if (salida.current === frase) { salida.current = null; reanudar(); } }; window.speechSynthesis.speak(frase);
  }
  useEffect(() => {
    vigente.current = true;
    const cargar = () => void api<typeof preferencias.current>("/asistente/preferencias").then(p => { preferencias.current = { ...preferencias.current, ...p }; if (!p.vozHabilitada) detener(); }).catch(() => undefined);
    const ajustar = () => setPosicion(p => limitarPosicion(p.x, p.y));
    const ocultar = () => { if (document.hidden) detener(); };
    const cliente = (e: Event) => { const d = (e as CustomEvent<{ clienteId: string | null; confirmado: boolean }>).detail; if (d && (d.clienteId === null || typeof d.clienteId === "string")) void clienteEvento.current(d.clienteId, d.confirmado); };
    const paso = (e: Event) => { const d = (e as CustomEvent<{ campo: string }>).detail; if (d && typeof d.campo === "string") void pasoEvento.current(d.campo); };
    cargar(); window.addEventListener("resize", ajustar); window.addEventListener("ambie:asistente-configurado", cargar); document.addEventListener("visibilitychange", ocultar);
    window.addEventListener("ambie:voz-cliente", cliente);
    window.addEventListener("ambie:voz-paso", paso);
    return () => { vigente.current = false; sesion.current?.cerrar(); if (temporizadorMensaje.current) clearTimeout(temporizadorMensaje.current); if (salida.current) window.speechSynthesis.cancel(); window.removeEventListener("resize", ajustar); window.removeEventListener("ambie:asistente-configurado", cargar); document.removeEventListener("visibilitychange", ocultar); window.removeEventListener("ambie:voz-cliente", cliente); window.removeEventListener("ambie:voz-paso", paso); };
  }, []);
  useEffect(() => { try { localStorage.setItem("ambie:ui:microfono", JSON.stringify(posicion)); } catch {} }, [posicion]);
  function ruta(orden: IntencionAsistente) {
    const vendedor = rol === "vendedor";
    if (orden.accion === "crear_pedido") return vendedor ? "/vendedor/pedido" : "/admin/ventas/pedido";
    if (orden.accion === "crear_cliente") return vendedor ? "/vendedor/clientes/nuevo" : "/admin/ventas/clientes/nuevo";
    if (orden.accion === "recibir_abono") return vendedor ? "/vendedor/abonos" : ubicacion.pathname === "/admin/creditos" ? "/admin/creditos" : "/admin/ventas/abonos";
    if (/usuario/.test(orden.accion || "")) return "/admin/usuarios";
    if (/compra|proveedor|gasto/.test(orden.accion || "")) return "/admin/compras";
    if (orden.accion === "cambiar_precio") return "/admin/precios";
    if (orden.accion === "registrar_cierre") return "/admin/cierre";
    if (orden.accion === "trasladar_pedido") return "/admin/cierre";
    if (orden.accion === "registrar_egreso") return "/admin/caja";
    if (/pedido/.test(orden.accion || "")) {
      const id = resolverReferencia(orden.payload.pedidoId, datos.pedidos.map(p => ({ id: p.id, nombre: p.numero })));
      return id ? `${vendedor ? "/vendedor" : "/admin/ventas"}/pedido/${encodeURIComponent(id)}` : vendedor ? "/vendedor" : "/admin/ventas";
    }
    return "/admin/inventario";
  }
  async function mostrar(orden: IntencionAsistente, campoForzado?: string) {
    firma.current = "";
    if (!pendiente.current || pendiente.current.accion !== orden.accion) { clienteConfirmado.current = null; productosConfirmados.current = ""; }
    if (typeof orden.payload.productoId === "string" && orden.payload.productoId && datos.inventario.length) {
      try { orden = { ...orden, payload: { ...orden.payload, productoId: resolverProductoVoz(orden.payload.productoId, datos.inventario) } }; }
      catch (e) { if (e instanceof ProductoVozAmbiguo) aclaracionProducto.current = { orden, indice: -1, opciones: e.opciones, campoForzado }; throw e; }
    }
    if (orden.accion === "crear_pedido" && typeof orden.payload.clienteId === "string") {
      const id = resolverReferencia(orden.payload.clienteId, datos.clientes);
      if (id) { orden = { ...orden, payload: { ...orden.payload, clienteId: id } }; if (!campoForzado) clienteConfirmado.current = id; }
    }
    if (orden.accion === "crear_pedido" && Array.isArray(orden.payload.lineas)) {
      const unificadas = new Map<string, { productoId: string; cantidad: number }>();
      for (const [indice, l] of orden.payload.lineas.entries()) {
        if (!l || typeof l !== "object" || Array.isArray(l) || typeof l.cantidad !== "number" || !Number.isSafeInteger(l.cantidad) || l.cantidad <= 0) throw new Error("Di una cantidad entera positiva para cada producto. Conservé la lista anterior.");
        let id: string;
        try { id = resolverProductoVoz(l.productoId, datos.inventario.filter(p => p.activo)); }
        catch (e) { if (e instanceof ProductoVozAmbiguo) aclaracionProducto.current = { orden, indice, opciones: e.opciones, campoForzado }; throw e; }
        unificadas.set(id, { productoId: id, cantidad: (unificadas.get(id)?.cantidad ?? 0) + l.cantidad });
      }
      for (const l of unificadas.values()) {
        const producto = datos.inventario.find(p => p.id === l.productoId)!;
        if (l.cantidad > producto.stock) throw new Error(`Solo hay ${producto.stock} unidades disponibles de ${producto.nombre}. Conservé la lista anterior.`);
      }
      orden = { ...orden, payload: { ...orden.payload, lineas: [...unificadas.values()] } };
    }
    aclaracionProducto.current = null;
    const productosCambiaron = JSON.stringify(pendiente.current?.payload.lineas) !== JSON.stringify(orden.payload.lineas);
    pendiente.current = orden; firma.current = "";
    if (orden.destino) { const destino = rutaAsistente(orden.destino, rol); if (destino) navegar(destino); pendiente.current = null; responder(orden.mensaje); return; }
    if (!orden.accion || !esAccionAsistente(orden.accion)) { responder(orden.mensaje); return; }
    let paso = campoForzado ? { campo: campoForzado, pregunta: preguntaCampo(campoForzado) } : pasoConversacion(orden, rol, datos);
    if (!campoForzado && orden.accion === "crear_pedido" && Array.isArray(orden.payload.lineas) && orden.payload.lineas.length && !["tipoCliente", "clienteId", "confirmarCliente"].includes(paso?.campo ?? "") && firmaProductosVoz(orden.payload.lineas) !== productosConfirmados.current) paso = { campo: "lineas", pregunta: preguntaCampo("lineas") };
    if (orden.accion === "crear_pedido" && typeof orden.payload.clienteId === "string" && orden.payload.clienteId && !["tipoCliente", "clienteId"].includes(campoForzado || "")) {
      const cliente = datos.clientes.find((c) => c.id === orden.payload.clienteId);
      if (!cliente) paso = { campo: "clienteId", pregunta: "No identifico un cliente único con ese nombre. Selecciona el registro correcto en pantalla." };
      else if (clienteConfirmado.current !== cliente.id) paso = { campo: "confirmarCliente", pregunta: `Seleccioné a ${cliente.nombre}. ¿Es el cliente correcto? Di confirmar cliente o elige otro en pantalla.` };
    }
    campo.current = paso?.campo || "";
    const destino = ruta(orden); if (ubicacion.pathname !== destino) navegar(destino);
    await despuesDePintar();
    let pantalla = await pantallaVoz(orden.accion);
    if (!vigente.current || !sesion.current) return;
    if (!pantalla) { responder("Completa esta operación con los controles de esta pantalla. No guardaré nada por fuera del aplicativo."); return; }
    pantalla.aplicar(orden.payload, campo.current); await despuesDePintar();
    const montada = await pantallaVoz(orden.accion);
    if (montada && montada !== pantalla) { pantalla = montada; pantalla.aplicar(orden.payload, campo.current); await despuesDePintar(); }
    if (paso) {
      if (orden.accion === "crear_pedido" && paso.campo === "lineas" && Array.isArray(orden.payload.lineas) && orden.payload.lineas.length) {
        responder(`${productosCambiaron ? "Productos actualizados." : "Revisa los productos."} Di confirmar productos para continuar.`);
      } else responder(paso.pregunta);
      return;
    }
    try {
      const actual = pantalla.leer(); prepararOperacionAsistente(orden.accion, actual, rol); firma.current = JSON.stringify(actual);
      sonar("listo"); responder(resumenIntencion(orden.accion, actual, datos) + " Di confirmar operación para guardar.");
    } catch { responder("Completa los campos de esta pantalla. Después di revisar operación."); }
  }
  async function elegirClienteVoz(id: string | null, confirmado: boolean) {
    const orden = pendiente.current;
    if (!sesion.current || !vigente.current || ocupado.current || orden?.accion !== "crear_pedido" || (id !== null && !datos.clientes.some((c) => c.id === id))) return;
    ocupado.current = true;
    try {
      clienteConfirmado.current = confirmado ? id : null;
      await mostrar({ ...orden, payload: { ...orden.payload, clienteId: id } }, confirmado ? "lineas" : "confirmarCliente");
    } finally { ocupado.current = false; reanudar(); }
  }
  async function guiarPaso(campoNuevo: string) {
    const orden = pendiente.current;
    if (!sesion.current || !vigente.current || ocupado.current || orden?.accion !== "crear_pedido" || !["clienteId", "lineas", "estadoInicial", "metodo"].includes(campoNuevo)) return;
    ocupado.current = true;
    try {
      const actual = (await pantallaVoz("crear_pedido"))?.leer() ?? {};
      const editados = Object.fromEntries(Object.entries(actual).filter(([k]) => Object.hasOwn(orden.payload, k) || k === campo.current));
      if (campoNuevo === "clienteId") clienteConfirmado.current = null;
      if (campo.current === "lineas" && campoNuevo === "estadoInicial") productosConfirmados.current = firmaProductosVoz(actual.lineas);
      await mostrar({ ...orden, payload: { ...orden.payload, ...editados } }, campoNuevo);
    } finally { ocupado.current = false; reanudar(); }
  }
  useEffect(() => { clienteEvento.current = elegirClienteVoz; pasoEvento.current = guiarPaso; });
  async function confirmar() {
    const orden = pendiente.current;
    if (!orden?.accion || !esAccionAsistente(orden.accion)) { responder("Primero completa los datos de la operación."); return; }
    if (!preferencias.current.confirmacionVoz) { responder("Confirma con el botón de esta pantalla."); return; }
    if (!firma.current) {
      try { prepararOperacionAsistente(orden.accion, orden.payload, rol); }
      catch { await mostrar(orden); return; }
      if (orden.accion === "crear_pedido") {
        clienteConfirmado.current = typeof orden.payload.clienteId === "string" ? orden.payload.clienteId : null;
        productosConfirmados.current = firmaProductosVoz(orden.payload.lineas);
        for (const paso of ["lineas", "estadoInicial", "metodo"]) {
          await mostrar(orden, paso);
          if (!vigente.current || !sesion.current) return;
        }
      }
      await mostrar(orden);
      if (!firma.current) return;
    }
    const pantalla = await pantallaVoz(orden.accion);
    if (!pantalla) { responder("Abre de nuevo la operación antes de confirmar."); return; }
    const actual = pantalla.leer();
    if (firma.current !== JSON.stringify(actual)) { firma.current = ""; await mostrar({ ...orden, payload: actual as IntencionAsistente["payload"] }); return; }
    prepararOperacionAsistente(orden.accion, actual, rol); firma.current = ""; setEstado("guardando"); sonar("procesando");
    if (await pantalla.confirmar()) { pendiente.current = null; campo.current = ""; aclaracionProducto.current = null; clienteConfirmado.current = null; productosConfirmados.current = ""; sonar("guardado"); const total = totalIntencion(orden.accion, actual, datos); responder(orden.accion === "crear_pedido" ? `Pedido confirmado.${total !== null ? ` Total: ${total.toLocaleString("es-CO")} pesos.` : ""} ¿Otro pedido, crear cliente o recibir abono?` : "La operación quedó guardada. ¿Qué quieres hacer ahora?"); }
    else { sonar("error"); responder("No se guardó. Revisa el aviso y los datos de la pantalla."); }
  }
  async function recibir(evento: EventoVoz) {
    if (!vigente.current) return;
    if (evento.tipo === "error") { detener(); mostrarMensaje(evento.mensaje); return; }
    if (evento.tipo !== "final" || !evento.texto || ocupado.current || salida.current) return;
    if (evento.confianza < .65) {
      const orden = pendiente.current;
      if (campo.current === "lineas" && orden?.accion === "crear_pedido" && evento.confianza >= .35) {
        const nombre = productosHablados(evento.texto)?.lineas[0]?.productoId ?? evento.texto.replace(/^(?:quiero|necesito|dame|me das|ponme)\s+/, "");
        let opciones: Array<{ id: string; nombre: string }> = [];
        try { const id = resolverProductoVoz(nombre, datos.inventario.filter(p => p.activo)); const producto = datos.inventario.find(p => p.id === id); if (producto) opciones = [producto]; }
        catch (e) { if (e instanceof ProductoVozAmbiguo) opciones = e.opciones; }
        if (opciones.length) { firma.current = ""; aclaracionProducto.current = { orden, indice: -2, opciones }; responder(`No escuché bien. ¿Quieres ${opciones.slice(0, 3).map(p => p.nombre).join(" o ")}?`); return; }
      }
      responder("No escuché con claridad. Repite la frase."); return;
    }
    ocupado.current = true; sesion.current?.pausar(true);
    try {
      const comando = comandoVoz(evento.texto, evento.confianza);
      const texto = evento.texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[.!?]+$/, "");
      const ordenActual = pendiente.current;
      if (ordenActual?.accion === "crear_pedido" && (["tipoCliente", "clienteId", "confirmarCliente"].includes(campo.current) || /^(?:no,?\s+)?(?:me equivoque|cambia(?:r)? cliente|otro cliente|es para)\b/.test(texto))) {
        const nombre = texto.replace(/^(?:no,?\s+)?(?:me equivoque[,]?\s*|cambia(?:r)? cliente\s*(?:a\s+)?|otro cliente\s*|es para\s*|para\s*|el cliente es\s*)/, "");
        const candidatos = datos.clientes.filter(c => c.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === nombre);
        if (candidatos.length === 1) {
          clienteConfirmado.current = candidatos[0].id;
          await mostrar({ ...ordenActual, payload: { ...ordenActual.payload, clienteId: candidatos[0].id } }, "lineas"); return;
        }
        if (/^(?:no,?\s+)?(?:me equivoque|cambia(?:r)? cliente|otro cliente)\b/.test(texto)) {
          clienteConfirmado.current = null;
          await mostrar({ ...ordenActual, payload: { ...ordenActual.payload, clienteId: "" } }, "clienteId"); return;
        }
      }
      if (/^(continuar|siguiente|continuar a entrega|continuar al pago|confirmar productos|productos correctos|lista correcta|productos listos)$/.test(texto) && ordenActual?.accion && esAccionAsistente(ordenActual.accion)) {
        aclaracionProducto.current = null;
        if (/^(confirmar productos|productos correctos|lista correcta|productos listos)$/.test(texto) && (ordenActual.accion !== "crear_pedido" || campo.current !== "lineas")) { responder("Primero revisa la lista de productos en su paso."); return; }
        if (evento.confianza < .85) { responder("Repite continuar o utiliza el botón de la pantalla."); return; }
        if (["clienteId", "tipoCliente", "confirmarCliente"].includes(campo.current)) { responder("Selecciona y confirma el cliente antes de continuar."); return; }
        const pantalla = await pantallaVoz(ordenActual.accion);
        const actual = pantalla?.leer() ?? {};
        const valor = actual[campo.current];
        if (valor === undefined || valor === "" || (Array.isArray(valor) && !valor.length)) { responder(preguntaCampo(campo.current)); return; }
        const campos = camposConversacion(ordenActual.accion);
        const siguiente = campos[campos.indexOf(campo.current) + 1];
        if (ordenActual.accion === "crear_pedido" && campo.current === "lineas") productosConfirmados.current = firmaProductosVoz(valor);
        await mostrar({ ...ordenActual, payload: { ...ordenActual.payload, [campo.current]: valor } }, siguiente); return;
      }
      if (campo.current === "confirmarCliente" && ordenActual?.accion === "crear_pedido" && /^(no|no es|otro cliente|cambiar cliente)$/.test(texto)) {
        clienteConfirmado.current = null;
        await mostrar({ ...ordenActual, payload: { ...ordenActual.payload, clienteId: "" } }, "clienteId"); return;
      }
      if (campo.current === "confirmarCliente" && ordenActual?.accion === "crear_pedido" && /^(confirmar cliente|cliente correcto|si|si es|correcto|ese cliente)$/.test(texto)) {
        if (evento.confianza < .85) { responder("Confirma el cliente con el botón o repite confirmar cliente."); return; }
        const pantalla = await pantallaVoz("crear_pedido");
        const id = pantalla?.leer().clienteId;
        if (typeof id !== "string" || !datos.clientes.some(c => c.id === id)) { responder("Selecciona primero un cliente válido."); return; }
        clienteConfirmado.current = id;
        await mostrar({ ...ordenActual, payload: { ...ordenActual.payload, clienteId: id } }, "lineas"); return;
      }
      if (/^(volver|atras|regresar|paso anterior|devolverme|me quiero devolver|quiero volver)(?: al? | a | en el proceso| un paso)?(cliente|clientes|productos|entrega|pago|proveedor|monto|metodo|concepto|conteo|fecha|precio)?$/.test(texto)) {
        cantidadProducto.current = null;
        aclaracionProducto.current = null;
        firma.current = "";
        if (!ordenActual?.accion || !esAccionAsistente(ordenActual.accion)) { navegar(rol === "vendedor" ? "/vendedor" : "/admin"); responder("Volvimos al inicio. ¿Qué sección quieres abrir?"); return; }
        const camposDisponibles = camposConversacion(ordenActual.accion);
        const solicitado = /cliente/.test(texto) ? "clienteId" : /producto/.test(texto) ? (ordenActual.accion === "crear_pedido" ? "lineas" : "productoId") : /entrega/.test(texto) ? "estadoInicial" : /pago|metodo/.test(texto) ? "metodo" : /proveedor/.test(texto) ? "proveedorId" : /monto/.test(texto) ? "monto" : /concepto/.test(texto) ? "concepto" : /conteo/.test(texto) ? "conteoId" : /fecha/.test(texto) ? "fecha" : /precio/.test(texto) ? "nuevoPrecio" : undefined;
        const objetivo = solicitado && camposDisponibles.includes(solicitado) ? solicitado : campoAnteriorConversacion(ordenActual.accion, campo.current);
        if (["clienteId", "tipoCliente"].includes(objetivo)) clienteConfirmado.current = null;
        const pantalla = await pantallaVoz(ordenActual.accion);
        const actual = pantalla?.leer() ?? {};
        const editados = Object.fromEntries(Object.entries(actual).filter(([k]) => Object.hasOwn(ordenActual.payload, k) || k === campo.current.split(".")[0]));
        await mostrar({ ...ordenActual, payload: { ...ordenActual.payload, ...editados } }, objetivo); return;
      }
      if (comando === "confirmar") { await confirmar(); return; }
      if (comando === "cancelar") {
        cantidadProducto.current = null;
        const orden = pendiente.current; if (orden?.accion && esAccionAsistente(orden.accion)) (await pantallaVoz(orden.accion))?.cancelar();
        pendiente.current = null; aclaracionProducto.current = null; clienteConfirmado.current = null; productosConfirmados.current = ""; firma.current = ""; responder("Operación descartada. No se guardaron cambios."); return;
      }
      const aclaracion = aclaracionProducto.current;
      if (aclaracion) {
        let id: string | null = null;
        try {
          const ordinal = ({ primero: 0, primera: 0, segundo: 1, segunda: 1, tercero: 2, tercera: 2 } as Record<string, number>)[texto.replace(/^(el|la)\s+/, "")];
          id = ordinal !== undefined && aclaracion.opciones[ordinal] ? aclaracion.opciones[ordinal].id : aclaracion.opciones.length === 1 && /^(si|ese|correcto)$/.test(texto) ? aclaracion.opciones[0].id : resolverProductoVoz(evento.texto, aclaracion.opciones);
        }
        catch (e) { if (aclaracion.orden.accion !== "crear_pedido" || !productosHablados(evento.texto)) throw e; aclaracionProducto.current = null; }
        if (id) {
          if (aclaracion.indice === -2) { aclaracionProducto.current = null; cantidadProducto.current = id; responder("¿Cuántas unidades?"); return; }
          const payload = { ...aclaracion.orden.payload };
          if (aclaracion.indice < 0) payload.productoId = id;
          else payload.lineas = (payload.lineas as Array<{ productoId: string; cantidad: number }>).map((l, i) => i === aclaracion.indice ? { ...l, productoId: id } : l);
          await mostrar({ ...aclaracion.orden, payload }, aclaracion.campoForzado); return;
        }
      }
      let orden = pendiente.current;
      if (orden?.accion === "crear_pedido" && campo.current === "lineas") {
        const actual = (await pantallaVoz("crear_pedido"))?.leer();
        if (actual && Array.isArray(actual.lineas)) orden = { ...orden, payload: { ...orden.payload, lineas: actual.lineas } };
        if (cantidadProducto.current) {
          const cantidad = numeroHablado(texto.replace(/\s+unidades?$/, ""));
          if (cantidad !== undefined && Number.isSafeInteger(cantidad) && cantidad > 0) {
            const productoId = cantidadProducto.current; cantidadProducto.current = null;
            await mostrar({ ...orden, payload: { ...orden.payload, lineas: [...(Array.isArray(orden.payload.lineas) ? orden.payload.lineas : []), { productoId, cantidad }] } }); return;
          }
          if (!productosHablados(evento.texto)) { responder("¿Cuántas unidades? Di un número."); return; }
          cantidadProducto.current = null;
        }
        if (!productosHablados(evento.texto) && !/^(quita|quitar|elimina|eliminar|borra|borrar|revisar|reconstruir|vaciar|empezar|abrir|abre|ver|muestra|confirmar|cancelar|no)\b/.test(texto)) {
          const nombre = texto.replace(/^(?:quiero|necesito|dame|me das|ponme)\s+/, "");
          try { cantidadProducto.current = resolverProductoVoz(nombre, datos.inventario.filter(p => p.activo)); firma.current = ""; responder("¿Cuántas unidades?"); return; }
          catch (e) { if (e instanceof ProductoVozAmbiguo) { aclaracionProducto.current = { orden, indice: -2, opciones: e.opciones }; firma.current = ""; throw e; } if (preferencias.current.proveedor === "basico" && e instanceof Error && /No encontré/.test(e.message)) throw e; }
        }
      }
      const quitar = /^(?:quita|quitar|elimina|eliminar|borra|borrar)\s+(?:el producto\s+)?(.+)$/i.exec(evento.texto.trim());
      if (orden?.accion === "crear_pedido" && quitar && Array.isArray(orden.payload.lineas)) {
        const id = resolverProductoVoz(quitar[1], datos.inventario);
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
    if (!preferencias.current.vozHabilitada) { mostrarMensaje("El administrador desactivó la voz."); return; }
    ocupado.current = true; setActivo(true); setEstado("conectando");
    const nueva = new SesionVoz(e => recibirRef.current(e), n => setNivel(n)); sesion.current = nueva;
    try { await nueva.iniciar(); if (sesion.current === nueva) responder("Te escucho. Dime qué quieres hacer."); }
    catch (e) { detener(); mostrarMensaje(e instanceof Error ? e.message : "No se pudo activar el micrófono."); }
    finally { ocupado.current = false; }
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
