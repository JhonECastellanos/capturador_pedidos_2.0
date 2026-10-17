import { useId, useRef } from "react";
import { tiposNodo, textoEstado, type Nodo, type Paso } from "./grafo-modelo";
import "./workflows-grafo.css";

function Flecha() {
  return <span className="wf-flecha" aria-hidden="true"><svg width="24" height="32" viewBox="0 0 24 32" fill="none"><path d="M12 1v26m-6-6 6 7 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}

export function GrafoSecuencial({ nodos, claves, seleccionado, onSeleccionar, pasos, estado, compacto = false, deshabilitado = false }: {
  nodos: Nodo[]; claves?: string[]; seleccionado?: number; onSeleccionar?: (indice: number, configurar?: boolean) => void; pasos?: Paso[]; estado?: string; compacto?: boolean; deshabilitado?: boolean;
}) {
  const ayuda = useId();
  const botones = useRef<Array<HTMLButtonElement | null>>([]);
  const siguiente = pasos?.findIndex(p => p.estado === "pendiente") ?? -1;
  return <div className={`wf-grafo${compacto ? " wf-grafo--compacto" : ""}`}>
    {!compacto && <p id={ayuda} className="wf-ayuda">Recorrido secuencial · de arriba hacia abajo.{onSeleccionar ? " Selecciona un paso para ver su detalle. También puedes usar Tab, ↑, ↓, Inicio y Fin." : ""}</p>}
    <div className="wf-terminal"><span aria-hidden="true">●</span> Inicio</div>
    <ol className="wf-recorrido" aria-label="Pasos del workflow en orden">
      {nodos.map((nodo, i) => {
        const paso = pasos?.[i];
        const actual = !!paso && (paso.estado === "ejecutando" || (estado === "pausada" && i === siguiente));
        const tipo = tiposNodo[nodo.tipo];
        const contenido = <><span className="wf-numero" aria-hidden="true">{compacto ? i + 1 : tipo.simbolo}</span><span className="wf-nodo-texto"><small>{compacto ? tipo.nombre : `Paso ${i + 1} · ${tipo.nombre}`}</small><strong>{nodo.nombre || "Paso sin nombre"}</strong>{!compacto && nodo.tipo === "condicion" && <small>Continuar si el anterior {nodo.esperado === "error" ? "tiene error" : "se completó"}</small>}{!compacto && nodo.tipo === "revision" && <small>Requiere intervención humana</small>}{paso && <span className="wf-estado">{textoEstado(paso.estado)}{actual && paso.estado === "pendiente" ? " · Siguiente paso" : ""}</span>}</span></>;
        const clase = `wf-nodo${seleccionado === i ? " wf-nodo--seleccionado" : ""}${actual ? " wf-nodo--actual" : ""}`;
        return <li key={claves?.[i] ?? i} className="wf-paso" data-estado={paso?.estado}>
          <Flecha />
          {onSeleccionar ? <button ref={el => { botones.current[i] = el; }} type="button" className={clase} disabled={deshabilitado} aria-pressed={seleccionado === i} aria-current={actual ? "step" : undefined} aria-describedby={compacto ? undefined : ayuda} onClick={() => onSeleccionar(i, true)} onKeyDown={e => {
            const destino = e.key === "ArrowDown" ? Math.min(i + 1, nodos.length - 1) : e.key === "ArrowUp" ? Math.max(i - 1, 0) : e.key === "Home" ? 0 : e.key === "End" ? nodos.length - 1 : -1;
            if (destino < 0) return;
            e.preventDefault(); onSeleccionar(destino); botones.current[destino]?.focus();
          }}>{contenido}</button> : <div className={clase}>{contenido}</div>}
        </li>;
      })}
    </ol>
    <Flecha />
    <div className="wf-terminal"><span aria-hidden="true">■</span> Fin{estado ? ` · ${estado === "completada" ? "Alcanzado" : "Sin alcanzar"}` : ""}</div>
  </div>;
}
