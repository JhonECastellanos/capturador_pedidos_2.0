import type { ConfigConocimiento } from "./conocimiento-modelo";
import "./workflows-grafo.css";

export function GrafoConocimiento({ config }: { config: ConfigConocimiento }) {
  return <section className="wf-grafo" aria-label="Contexto del asistente">
    <h3 className="font-semibold">Contexto del asistente</h3>
    <p className="wf-ayuda">Un solo contexto del negocio alimenta a voz y chat. Los workflows operativos conservan sus pasos y permisos.</p>
    <ul className="wf-contexto">
      <li className="wf-contexto-nodo"><strong>Fuentes · {config.fuentes.length}</strong><ul>{config.fuentes.map(f => <li key={f.id}>{f.nombre || "Sin nombre"} · {f.tipo === "md" ? "Markdown" : f.tipo === "api" ? "Alias API" : "Alias PostgreSQL"}</li>)}</ul>{config.fuentes.length === 0 && <p>Sin fuentes configuradas</p>}</li>
      <li className="wf-contexto-nodo"><strong>Reglas del negocio</strong><p>{config.reglas.trim() ? "Documento de reglas configurado" : "Sin reglas configuradas"}</p></li>
      <li className="wf-contexto-nodo"><strong>Memoria de conversación</strong><p>Cada conversación conserva su contexto sin mezclar usuarios.</p></li>
    </ul>
    <p className="wf-terminal">Fuentes y reglas → Modelo → Respuesta</p>
  </section>;
}
