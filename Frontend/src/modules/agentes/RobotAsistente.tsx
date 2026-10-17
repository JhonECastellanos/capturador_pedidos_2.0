import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import "./robot-asistente.css";
import dibujoAbi from "../../assets/branding/abi.svg?raw";

// Decoración estática: no añade trabajo por fotograma ni eventos al dibujo.
const estrellasAbi = <svg className="abi-constelacion-svg" viewBox="0 0 100 112" aria-hidden="true"><g className="abi-chispas" fill="currentColor"><path d="m14 17 1.5 4.5L20 23l-4.5 1.5L14 29l-1.5-4.5L8 23l4.5-1.5Z"/><path d="m84 6 1.5 4.5L90 12l-4.5 1.5L84 18l-1.5-4.5L78 12l4.5-1.5Z"/><path d="m86 78 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/><circle cx="12" cy="72" r="1.6"/><circle cx="70" cy="96" r="1.4"/></g></svg>;

type Props = { abierto: boolean; escuchando: boolean; hablando: boolean; ocupado: boolean; robotRef: RefObject<HTMLButtonElement | null>; alternar: () => void; apagar: () => void; cerrarBurbuja: () => void; ancho: number; children: ReactNode; etiqueta?: string; instrucciones?: string };

export function RobotAsistente({ abierto, escuchando, hablando, ocupado, robotRef, alternar, apagar, cerrarBurbuja, ancho, children, etiqueta = "ABI, asistente de operaciones", instrucciones = "Toca para activar o silenciar el micrófono · dos toques para apagar · arrastra para mover" }: Props) {
  const contenedor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: PointerEvent) => { if (!contenedor.current?.contains(e.target as Node)) cerrarBurbuja(); };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, [abierto, cerrarBurbuja]);
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  const arrastre = useRef<{ x: number; y: number; inicioX: number; inicioY: number; movido: boolean } | null>(null);
  const movido = useRef(false);
  const ultimoToque = useRef(0);
  const ultimoMovimiento = useRef(0);
  useEffect(() => {
    const apartar = (e: PointerEvent) => {
      if (abierto || window.matchMedia("(prefers-reduced-motion: reduce)").matches || (e.type === "pointermove" && e.pointerType !== "mouse") || arrastre.current || contenedor.current?.contains(e.target as Node) || contenedor.current?.contains(document.activeElement) || Date.now() - ultimoMovimiento.current < 1600) return;
      if (!(e.target instanceof Element) || !e.target.closest("button,a,input,select,textarea,[role=button]")) return;
      const r = robotRef.current?.getBoundingClientRect();
      if (!r || Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) > 95) return;
      ultimoMovimiento.current = Date.now();
      setPosicion({ x: e.clientX > window.innerWidth / 2 ? 8 : window.innerWidth - 68, y: Math.min(window.innerHeight - 76, Math.max(8, e.clientY + 80)) });
    };
    // El foco del formulario se conserva; no interceptar Tab, click ni touch.
    const apartarDelFoco = (e: FocusEvent) => {
      if (abierto || arrastre.current || !(e.target instanceof Element) || contenedor.current?.contains(e.target)) return;
      const objetivo = e.target.closest("input,select,textarea,button,a,[contenteditable=true],[role=button]");
      const r = robotRef.current?.getBoundingClientRect();
      if (!objetivo || !r) return;
      const f = objetivo.getBoundingClientRect();
      const solapa = (x: number, y: number) => x < f.right + 12 && x + r.width > f.left - 12 && y < f.bottom + 12 && y + r.height > f.top - 12;
      if (!solapa(r.left, r.top)) return;
      const derecha = Math.max(8, window.innerWidth - r.width - 8);
      const abajo = Math.max(8, window.innerHeight - r.height - 8);
      const destino = [{ x: 8, y: abajo }, { x: derecha, y: abajo }, { x: 8, y: 8 }, { x: derecha, y: 8 }].find(p => !solapa(p.x, p.y));
      if (destino) setPosicion(destino);
    };
    document.addEventListener("pointermove", apartar, { passive: true });
    document.addEventListener("pointerdown", apartar, { passive: true });
    document.addEventListener("focusin", apartarDelFoco);
    return () => { document.removeEventListener("pointermove", apartar); document.removeEventListener("pointerdown", apartar); document.removeEventListener("focusin", apartarDelFoco); };
  }, [robotRef, abierto]);
  useEffect(() => {
    const ajustar = () => setPosicion(p => p ? { x: Math.max(8, Math.min(window.innerWidth - 68, p.x)), y: Math.max(8, Math.min(window.innerHeight - 76, p.y)) } : null);
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);
  const anchoVisible = Math.min(ancho, window.innerWidth - 24);
  const xRobot = posicion?.x ?? window.innerWidth - 68;
  const izquierdaBurbuja = Math.max(12, Math.min(window.innerWidth - anchoVisible - 12, xRobot + 56 - anchoVisible)) - xRobot;
  const estado = hablando ? "hablando" : ocupado ? "pensando" : escuchando ? "escuchando" : "reposo";
  return <aside ref={contenedor} aria-label={etiqueta} className="fixed z-50 abi-contenedor" style={posicion ? { left: posicion.x, top: posicion.y } : { right: 12, bottom: 12 }}>
    {abierto && <div className="absolute bottom-full mb-2" style={{ left: izquierdaBurbuja, ...(posicion && posicion.y < 220 ? { top: "100%", bottom: "auto", marginTop: 8 } : {}) }}>{children}</div>}
    <button ref={robotRef} type="button" aria-label={etiqueta} aria-expanded={abierto} aria-pressed={escuchando} title={instrucciones} data-estado={estado} className="robot-asistente" onPointerDown={e => {
      if (!e.isPrimary || e.button !== 0) return;
      const r = e.currentTarget.getBoundingClientRect();
      arrastre.current = { x: r.left, y: r.top, inicioX: e.clientX, inicioY: e.clientY, movido: false }; movido.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => {
      const a = arrastre.current; if (!a) return;
      const dx = e.clientX - a.inicioX, dy = e.clientY - a.inicioY;
      if (Math.hypot(dx, dy) > 6) a.movido = true;
      if (!a.movido) return;
      movido.current = true;
      setPosicion({ x: Math.max(8, Math.min(window.innerWidth - 68, a.x + dx)), y: Math.max(8, Math.min(window.innerHeight - 76, a.y + dy)) });
    }} onPointerUp={() => { arrastre.current = null; }} onPointerCancel={() => { arrastre.current = null; movido.current = true; }} onClick={e => { if (e.detail === 0) { ultimoToque.current = 0; alternar(); return; } if (!movido.current) { const ahora = Date.now(); if (ahora - ultimoToque.current < 320) { ultimoToque.current = 0; apagar(); } else { ultimoToque.current = ahora; alternar(); } } }}>
      <span className="abi-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dibujoAbi }} />
      {estrellasAbi}
      <span className="sr-only">{hablando ? "Respondiendo" : ocupado ? "Preparando detalle" : escuchando ? "Escuchando" : "Abrir asistente"}</span>
    </button>
  </aside>;
}
