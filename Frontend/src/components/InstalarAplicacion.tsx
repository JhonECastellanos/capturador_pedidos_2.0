import { useState } from "react";
import { estaInstalada, solicitarInstalacion } from "../utils/pwa";
export function InstalarAplicacion() {
  const [ayuda, setAyuda] = useState(false);
  if (estaInstalada()) return <p className="text-xs text-ink-soft">Synchronic.JO está abierta como aplicación.</p>;
  return <div className="text-sm">
    <button type="button" className="rounded-xl border border-line bg-paper-raised px-4 py-2 font-semibold" onClick={() => { void solicitarInstalacion().then(disponible => setAyuda(!disponible)); }}>Instalar aplicación</button>
    {ayuda && <div role="status" className="mt-2 rounded-xl border border-line bg-paper-raised p-3 text-xs leading-relaxed text-ink-soft">
      {!window.isSecureContext ? "Abre el negocio mediante HTTPS para instalarlo en este dispositivo. " : ""}
      En Android, Chrome o Edge: menú del navegador → Instalar aplicación o Añadir a pantalla de inicio. En iPhone o iPad: Safari → Compartir → Agregar a inicio. En computador: usa la opción Instalar del navegador.
      <button type="button" className="ml-2 underline" onClick={() => setAyuda(false)}>Cerrar</button>
    </div>}
  </div>;
}
