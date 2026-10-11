import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import "./robot-asistente.css";

type Props = { abierto: boolean; escuchando: boolean; hablando: boolean; ocupado: boolean; robotRef: RefObject<HTMLButtonElement | null>; alternar: () => void; apagar: () => void; cerrarBurbuja: () => void; ancho: number; children: ReactNode };

export function RobotAsistente({ abierto, escuchando, hablando, ocupado, robotRef, alternar, apagar, cerrarBurbuja, ancho, children }: Props) {
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
  useEffect(() => {
    const ajustar = () => setPosicion(p => p ? { x: Math.max(8, Math.min(window.innerWidth - 64, p.x)), y: Math.max(8, Math.min(window.innerHeight - 64, p.y)) } : null);
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);
  const anchoVisible = Math.min(ancho, window.innerWidth - 24);
  const xRobot = posicion?.x ?? window.innerWidth - 68;
  const izquierdaBurbuja = Math.max(12, Math.min(window.innerWidth - anchoVisible - 12, xRobot + 56 - anchoVisible)) - xRobot;
  const estado = hablando ? "hablando" : ocupado ? "pensando" : escuchando ? "escuchando" : "reposo";
  return <aside ref={contenedor} aria-label="Asistente de operaciones" className="fixed z-50" style={posicion ? { left: posicion.x, top: posicion.y } : { right: 12, bottom: 12 }}>
    {abierto && <div className="absolute bottom-full mb-2" style={{ left: izquierdaBurbuja, ...(posicion && posicion.y < 220 ? { top: "100%", bottom: "auto", marginTop: 8 } : {}) }}>{children}</div>}
    <button ref={robotRef} type="button" aria-label="Asistente" aria-expanded={abierto} aria-pressed={escuchando} title="Toca para activar o detener el micrófono · dos toques para apagar · arrastra para mover" data-estado={estado} className="robot-asistente" onPointerDown={e => {
      const r = e.currentTarget.getBoundingClientRect();
      arrastre.current = { x: r.left, y: r.top, inicioX: e.clientX, inicioY: e.clientY, movido: false }; movido.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => {
      const a = arrastre.current; if (!a) return;
      const dx = e.clientX - a.inicioX, dy = e.clientY - a.inicioY;
      if (Math.hypot(dx, dy) > 6) a.movido = true;
      if (!a.movido) return;
      movido.current = true;
      setPosicion({ x: Math.max(8, Math.min(window.innerWidth - 64, a.x + dx)), y: Math.max(8, Math.min(window.innerHeight - 64, a.y + dy)) });
    }} onPointerUp={() => { arrastre.current = null; }} onPointerCancel={() => { arrastre.current = null; movido.current = true; }} onClick={() => { if (!movido.current) { const ahora = Date.now(); if (ahora - ultimoToque.current < 320) { ultimoToque.current = 0; apagar(); } else { ultimoToque.current = ahora; alternar(); } } }}>
      <svg viewBox="0 0 64 64" aria-hidden="true" className="robot-dibujo">
        <circle className="robot-halo" cx="32" cy="34" r="27" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M32 13V8" stroke="currentColor" strokeWidth="3" /><circle cx="32" cy="6" r="3" fill="currentColor" />
        <rect x="12" y="16" width="40" height="36" rx="13" fill="var(--color-paper-raised, #fffdf5)" fillOpacity=".88" stroke="currentColor" strokeWidth="2" />
        <rect x="18" y="23" width="28" height="15" rx="7" fill="currentColor" fillOpacity=".15" />
        <g className="robot-ojos" fill="currentColor"><ellipse cx="25" cy="30" rx="3" ry="4" /><ellipse cx="39" cy="30" rx="3" ry="4" /></g>
        <path className="robot-boca" d="M25 43Q32 49 39 43" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M8 29v10M56 29v10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{hablando ? "Respondiendo" : ocupado ? "Preparando detalle" : escuchando ? "Escuchando" : "Abrir asistente"}</span>
    </button>
  </aside>;
}
