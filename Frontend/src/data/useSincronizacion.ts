import { useEffect, useState } from "react";
import { INTERVALO_SINCRONIZACION_MS, type Envelope, type RevisionDatosDTO } from "@ambie/contrato";
import { respuestaRed } from "./api";

/** Una consulta pequeña por pestaña visible; las listas solo se releen si cambian. */
export function useSincronizacion(usuarioId?: string) {
  const [conectado, setConectado] = useState(true);
  useEffect(() => {
    if (!usuarioId) return;
    let revision: string | undefined;
    let activo = true;
    let ocupado = false;
    const controlador = new AbortController();
    const comprobar = async () => {
      if (ocupado || document.hidden || !activo) return;
      ocupado = true;
      try {
        const { data } = await respuestaRed<Envelope<RevisionDatosDTO>>("/sincronizacion/revision", "GET", undefined, controlador.signal);
        if (!activo) return;
        setConectado(true);
        // También refresca en la primera lectura y tras una desconexión.
        if (data.revision !== revision) {
          revision = data.revision;
          window.dispatchEvent(new Event("ambie:datos-actualizados"));
        }
      } catch {
        if (activo) { revision = undefined; setConectado(false); }
      } finally { ocupado = false; }
    };
    void comprobar();
    const intervalo = window.setInterval(() => void comprobar(), INTERVALO_SINCRONIZACION_MS);
    const despertar = () => void comprobar();
    document.addEventListener("visibilitychange", despertar);
    window.addEventListener("online", despertar);
    return () => {
      activo = false; controlador.abort(); window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", despertar);
      window.removeEventListener("online", despertar);
    };
  }, [usuarioId]);
  return conectado;
}
