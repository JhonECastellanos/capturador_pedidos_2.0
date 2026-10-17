import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { APARIENCIA_INICIAL, AparienciaEsquema, type Apariencia } from "@abinova/contrato";
import { api, usaApi } from "../data/api";
import { aplicarApariencia } from "../utils/apariencia";
import { AparienciaContext } from "./apariencia-context";
export function AparienciaProvider({ children }: { children: ReactNode }) {
  const [apariencia, setApariencia] = useState<Apariencia>(APARIENCIA_INICIAL);
  useEffect(() => {
    if (!usaApi) return;
    let vigente = true, ocupado = false;
    const cargar = async () => {
      if (ocupado || document.hidden) return;
      ocupado = true;
      try { const v = AparienciaEsquema.parse(await api<Apariencia>("/apariencia")); if (vigente) setApariencia(anterior => JSON.stringify(anterior) === JSON.stringify(v) ? anterior : v); }
      catch { /* Conserva la apariencia visible mientras vuelve la conexión. */ }
      finally { ocupado = false; }
    };
    void cargar();
    const actualizar = () => { void cargar(); };
    window.addEventListener("abinova:datos-actualizados", actualizar);
    document.addEventListener("visibilitychange", actualizar);
    const intervalo = window.setInterval(actualizar, 60000);
    return () => { vigente = false; clearInterval(intervalo); window.removeEventListener("abinova:datos-actualizados", actualizar); document.removeEventListener("visibilitychange", actualizar); };
  }, []);
  useEffect(() => { aplicarApariencia(apariencia); }, [apariencia]);
  const guardar = useCallback(async (v: Apariencia) => {
    const valido = AparienciaEsquema.parse(v);
    setApariencia(usaApi ? await api<Apariencia>("/apariencia", "PUT", valido) : valido);
  }, []);
  const valor = useMemo(() => ({ apariencia, guardar }), [apariencia, guardar]);
  return <AparienciaContext.Provider value={valor}>{children}</AparienciaContext.Provider>;
}
