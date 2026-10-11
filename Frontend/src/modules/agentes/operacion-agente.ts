import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import type { InstruccionAgente, RevisionAgente } from "@synchronic-jo/contrato";
import { api } from "../../data/api";

let revision: RevisionAgente | null = null;
const listeners = new Set<() => void>();
const lectores = new Map<string, () => InstruccionAgente | undefined>();
export function contextoAgente() {
  const actual = lectores.get("conteo")?.();
  return actual?.conteoId ? { conteoId: actual.conteoId, ...(actual.producto ? { producto: actual.producto } : {}) } : undefined;
}
const confirmaciones = new Map<string, () => Promise<boolean>>();
let escriturasPendientes = 0;
export function agenteGuardando() { return escriturasPendientes > 0; }
export function revisionAgente() { return revision; }
export function cambiarRevisionAgente(r: RevisionAgente | null) { revision = r; listeners.forEach(l => l()); }
export function avisoAgente(mensaje: string) { window.dispatchEvent(new CustomEvent("ambie:agente-aviso", { detail: mensaje })); }
export function useRevisionAgente() { return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, revisionAgente); }
export async function confirmarDesdeAgente() {
  if (!revision || revision.faltantes.length) { avisoAgente(revision?.resumen ?? "Primero prepara una operación para revisar"); return false; }
  const confirmar = confirmaciones.get(revision.instruccion.operacion);
  if (!confirmar) { avisoAgente("Espera a que termine de cargar el detalle antes de confirmar"); return false; }
  return confirmar();
}
/** Voz y botón comparten la misma función y una sola escritura en curso. */
export function useOperacionAgente(operacion: InstruccionAgente["operacion"], aplicar: (r: RevisionAgente) => void, guardar: () => Promise<boolean>, leer?: () => InstruccionAgente) {
  const r = useRevisionAgente(), navegar = useNavigate();
  const funciones = useRef({ aplicar, guardar, leer });
  useEffect(() => { funciones.current = { aplicar, guardar, leer }; }, [aplicar, guardar, leer]);
  const aplicada = useRef(""), pendiente = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    if (!r || r.instruccion.operacion !== operacion || aplicada.current === `${r.id}:${r.version}`) return;
    aplicada.current = `${r.id}:${r.version}`; funciones.current.aplicar(r);
  }, [r, operacion]);
  const confirmar = useCallback(() => {
    if (pendiente.current) return pendiente.current;
    pendiente.current = (async () => {
      const anterior = revisionAgente();
      const propia = anterior?.instruccion.operacion === operacion ? anterior : null;
      try {
        if (propia) {
          if (propia.faltantes.length) { avisoAgente(propia.resumen); return false; }
          const actual = await api<RevisionAgente>("/agentes/revisar", "POST", { instruccion: funciones.current.leer?.() ?? propia.instruccion, id: propia.id, version: propia.version + 1 });
          if (revisionAgente() !== anterior) { avisoAgente("La operación cambió mientras se validaba. Revisa el detalle actual"); return false; }
          if (actual.faltantes.length || actual.huella !== propia.huella) { cambiarRevisionAgente(actual); avisoAgente(actual.faltantes.length ? actual.resumen : "Los datos o precios cambiaron. Revisa el detalle actualizado y vuelve a confirmar"); return false; }
        }
        escriturasPendientes++;
        let resultado: boolean;
        try { resultado = await funciones.current.guardar(); }
        finally { escriturasPendientes--; }
        if (!resultado) { if (propia) avisoAgente("No se confirmó el guardado. El detalle sigue disponible para corregir o reintentar"); return false; }
        if (propia && revisionAgente() === anterior) { cambiarRevisionAgente(null); avisoAgente("Operación guardada correctamente"); navegar(propia.ruta.startsWith("/admin") ? "/admin" : propia.ruta.startsWith("/inventario") ? "/inventario" : "/vendedor", { replace: true }); }
        return true;
      } catch (e) { avisoAgente(e instanceof Error ? e.message : "No se pudo confirmar; conserva el detalle y reintenta"); return false; }
    })().finally(() => { pendiente.current = null; });
    return pendiente.current;
  }, [operacion, navegar]);
  useEffect(() => { confirmaciones.set(operacion, confirmar); const lector = () => funciones.current.leer?.(); lectores.set(operacion, lector); return () => { if (lectores.get(operacion) === lector) lectores.delete(operacion); if (confirmaciones.get(operacion) === confirmar) confirmaciones.delete(operacion); }; }, [operacion, confirmar]);
  return confirmar;
}
