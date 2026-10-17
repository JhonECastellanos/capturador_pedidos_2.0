import { useState } from "react";
import { GrafoSecuencial } from "./GrafoSecuencial";
import { textoEstado, tiposNodo, type Paso } from "./grafo-modelo";

export function EjecucionVisual({ pasos, estado }: { pasos: Paso[]; estado: string }) {
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const actual = pasos.findIndex(p => p.estado === "ejecutando");
  const pendiente = pasos.findIndex(p => p.estado === "pendiente");
  const indice = Math.min(seleccion ?? (actual >= 0 ? actual : pendiente >= 0 ? pendiente : pasos.length - 1), pasos.length - 1);
  const paso = pasos[indice];
  const resueltos = pasos.filter(p => ["correcto", "omitido"].includes(p.estado)).length;
  return <div className="wf-ejecucion">
    <p role="status" className="wf-ayuda">{textoEstado(estado)} · {resueltos} de {pasos.length} pasos resueltos{pasos.some(p => p.estado === "omitido") ? " (incluye omitidos)" : ""}.</p>
    <div className="wf-distribucion"><GrafoSecuencial nodos={pasos.map(p => p.nodo)} pasos={pasos} estado={estado} seleccionado={indice} onSeleccionar={setSeleccion} />
      {paso ? <section className="wf-inspector" aria-label="Resultado del paso seleccionado"><h3>Paso {indice + 1} · {paso.nodo.nombre}</h3><span className="wf-insignia">{textoEstado(paso.estado)}</span><p className="wf-ayuda">{tiposNodo[paso.nodo.tipo].ayuda}</p>{paso.mensaje && <p className="wf-error">{paso.mensaje}</p>}{paso.resultado?.texto ? <p className="wf-resultado">{paso.resultado.texto}</p> : <p className="wf-ayuda">{paso.estado === "omitido" ? "El motor omitió este paso por una condición anterior." : "Este paso aún no tiene un resultado disponible."}</p>}</section> : <p className="wf-ayuda">El detalle de los pasos no está disponible.</p>}
    </div>
  </div>;
}
