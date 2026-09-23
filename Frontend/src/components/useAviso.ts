import { useEffect, useRef, useState } from "react";

export type TipoAviso = "exito" | "error" | "info";

export interface Aviso {
  mensaje: string;
  tipo: TipoAviso;
  deshacer?: () => void;
}

/**
 * Avisos flotantes al centro de la pantalla.
 * Una sola instancia por vista; el temporizador se reinicia en cada aviso.
 * Duración corta para no estorbar la operación.
 */
export function useAviso(duracion = 2200) {
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
