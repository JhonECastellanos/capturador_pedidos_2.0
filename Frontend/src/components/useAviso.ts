import { useEffect, useRef, useState } from "react";

export type TipoAviso = "exito" | "error" | "info";

export interface Aviso {
  mensaje: string;
  tipo: TipoAviso;
  deshacer?: () => void;
}

/**
 * Avisos tipo toast en tira fija sobre la barra inferior.
 * Una sola tira por pantalla; el temporizador se reinicia en cada aviso.
 */
export function useAviso(duracion = 4000) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  function mostrarAviso(mensaje: string, tipo: TipoAviso = "info", deshacer?: () => void) {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    setAviso({ mensaje, tipo, deshacer });
    temporizador.current = window.setTimeout(() => setAviso(null), duracion);
  }

  function cerrarAviso() {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    setAviso(null);
  }

  return { aviso, mostrarAviso, cerrarAviso };
}
