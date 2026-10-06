import { useLayoutEffect, useRef } from "react";
import type { AccionAsistente } from "@ambie/contrato";

export interface PantallaVoz {
  aplicar: (datos: Record<string, unknown>, campo: string) => void;
  leer: () => Record<string, unknown>;
  confirmar: () => Promise<boolean>;
  cancelar: () => void;
  volver?: () => void;
}
const pantallas = new Map<AccionAsistente, PantallaVoz[]>();
export function usePantallaVoz(acciones: AccionAsistente[], pantalla: PantallaVoz) {
  const ref = useRef(pantalla);
  const clave = acciones.join(",");
  useLayoutEffect(() => { ref.current = pantalla; });
  useLayoutEffect(() => {
    const enlace: PantallaVoz = { aplicar: (p, c) => ref.current.aplicar(p, c), leer: () => ref.current.leer(), confirmar: () => ref.current.confirmar(), cancelar: () => ref.current.cancelar(), volver: () => { if (ref.current.volver) ref.current.volver(); else throw new Error("Usa Volver en esta pantalla; tu borrador se conserva."); } };
    const nombres = clave.split(",") as AccionAsistente[];
    nombres.forEach((a) => pantallas.set(a, [...(pantallas.get(a) ?? []), enlace]));
    return () => { nombres.forEach((a) => { const restantes = (pantallas.get(a) ?? []).filter((p) => p !== enlace); if (restantes.length) pantallas.set(a, restantes); else pantallas.delete(a); }); };
  }, [clave]);
}
export async function pantallaVoz(accion: AccionAsistente): Promise<PantallaVoz | null> {
  for (let i = 0; i < 30; i++) {
    const pantalla = pantallas.get(accion)?.at(-1);
    if (pantalla) return pantalla;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
}
export const despuesDePintar = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
