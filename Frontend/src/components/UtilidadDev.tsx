import { useState } from "react";
import { limpiarTodo } from "../data/repositorios/almacenamiento";
import { ConfirmarAccion } from "./ConfirmarAccion";

/** Herramienta destructiva solo disponible en desarrollo. */
export function UtilidadDev() {
  const [confirmar, setConfirmar] = useState(false);
  if (!import.meta.env.DEV) return null;

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        className="text-[11.5px] font-medium text-ink-faint underline active:text-ink"
      >
        Utilidad dev: borrar todos los datos (dejar la app en cero)
      </button>
      <ConfirmarAccion
        abierto={confirmar}
        titulo="Borrar todos los datos"
        mensaje="Se borrarán los datos del negocio (clientes, productos, pedidos, inventario, caja, créditos y cierres). La app quedará como recién instalada; los dos accesos oficiales se conservan."
        textoConfirmar="Sí, borrar"
        tono="peligro"
        alCancelar={() => setConfirmar(false)}
        alConfirmar={() => {
          limpiarTodo();
          window.location.reload();
        }}
      />
    </div>
  );
}
