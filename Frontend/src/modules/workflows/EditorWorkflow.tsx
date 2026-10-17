import { useId, useRef, useState } from "react";
import { Boton } from "../../components/Boton";
import { GrafoSecuencial } from "./GrafoSecuencial";
import { tiposNodo, type Flujo, type Nodo } from "./grafo-modelo";
import type { ModuloWorkflow } from "./conocimiento-modelo";

export function EditorWorkflow({ flujo, conexiones, modulos, ocupado, onChange, onGuardar, onCancelar }: {
  flujo: Flujo; conexiones: Array<{ id: string; nombre: string }>;
  modulos: ModuloWorkflow[];
  ocupado: boolean; onChange: (flujo: Flujo) => void; onGuardar: () => void; onCancelar: () => void;
}) {
  const id = useId();
  const contador = useRef(flujo.nodos.length);
  // Identidades solo de interfaz: el motor conserva exclusivamente el orden del array.
  const [claves, setClaves] = useState(() => flujo.nodos.map((_, i) => `${id}-${i}`));
  const [seleccion, setSeleccion] = useState(claves[0]);
  const [anuncio, setAnuncio] = useState("");
  const inspector = useRef<HTMLFieldSetElement>(null);
  const indice = Math.max(0, claves.indexOf(seleccion));
  const nodo = flujo.nodos[indice];
  function actualizar(cambio: Partial<Nodo>) { onChange({ ...flujo, nodos: flujo.nodos.map((n, i) => i === indice ? { ...n, ...cambio } : n) }); }
  function mover(delta: number) {
    const destino = indice + delta;
    if (ocupado || destino < 0 || destino >= claves.length) return;
    const nodos = [...flujo.nodos], nuevasClaves = [...claves];
    [nodos[indice], nodos[destino]] = [nodos[destino], nodos[indice]];
    [nuevasClaves[indice], nuevasClaves[destino]] = [nuevasClaves[destino], nuevasClaves[indice]];
    onChange({ ...flujo, nodos }); setClaves(nuevasClaves);
    setAnuncio(`${nodo.nombre} ahora es el paso ${destino + 1}.`);
  }
  function agregar() {
    if (ocupado || claves.length >= 20) return;
    const clave = `${id}-${contador.current++}`;
    onChange({ ...flujo, nodos: [...flujo.nodos, { tipo: "revision", nombre: "Nuevo paso" }] });
    setClaves([...claves, clave]); setSeleccion(clave); setAnuncio("Paso agregado al final. Configúralo en el panel del paso seleccionado.");
  }
  function quitar() {
    if (ocupado || claves.length <= 1) return;
    onChange({ ...flujo, nodos: flujo.nodos.filter((_, i) => i !== indice) });
    setClaves(claves.filter((_, i) => i !== indice)); setSeleccion(claves[indice + 1] ?? claves[indice - 1]);
    setAnuncio(`Se quitó ${nodo.nombre} del borrador. Guarda para confirmar el cambio.`);
  }
  function seleccionar(i: number, configurar = false) {
    setSeleccion(claves[i]);
    if (configurar && inspector.current && inspector.current.parentElement!.clientWidth < 620) {
      inspector.current.scrollIntoView({ block: "start" });
      inspector.current.querySelector("select")?.focus({ preventScroll: true });
    }
  }
  return <form className="wf-editor" aria-label="Editor visual de workflow" onSubmit={e => {
    e.preventDefault();
    const invalido = flujo.nodos.findIndex(n => !n.nombre.trim());
    if (invalido >= 0) { setSeleccion(claves[invalido]); setAnuncio(`Escribe un nombre para el paso ${invalido + 1}.`); return; }
    if (!modulos.some(m => m.id === (flujo.modulo ?? "workflows") && m.habilitado)) { setAnuncio("Selecciona un módulo habilitado."); return; }
    if (!ocupado) onGuardar();
  }}>
    <div className="wf-cabecera"><div><h2>Editor visual</h2><p className="wf-ayuda">Un paso después de otro. Cambiar el orden cambia la ejecución al guardar.</p></div><span className="wf-insignia">Borrador · {flujo.nodos.length}/20 pasos</span></div>
    <fieldset disabled={ocupado} className="wf-datos">
      <label>Nombre del workflow<input required maxLength={90} value={flujo.nombre} onChange={e => onChange({ ...flujo, nombre: e.target.value })} /></label>
      <label>Ámbito<select value={flujo.ambito} onChange={e => onChange({ ...flujo, ambito: e.target.value })}><option value="control">Control del servicio</option><option value="empresa">Empresa</option><option value="clientes">Clientes</option></select></label>
      <label>Módulo del workflow<select required value={flujo.modulo ?? "workflows"} onChange={e => onChange({ ...flujo, modulo: e.target.value })}>{!modulos.some(m => m.id === (flujo.modulo ?? "workflows")) && <option value={flujo.modulo ?? "workflows"} disabled>Módulo guardado no disponible</option>}{modulos.map(m => <option key={m.id} value={m.id} disabled={!m.habilitado}>{m.nombre}{!m.habilitado ? " · No habilitado" : ""}</option>)}</select></label>
      <label>Estado del workflow<select value={flujo.estado ?? "publicado"} onChange={e => onChange({ ...flujo, estado: e.target.value as Flujo["estado"] })}><option value="borrador">Borrador</option><option value="publicado">Publicado</option><option value="deshabilitado">Deshabilitado</option></select></label>
    </fieldset>
    <div className="wf-distribucion">
      <section aria-label="Grafo del borrador"><GrafoSecuencial nodos={flujo.nodos} claves={claves} seleccionado={indice} onSeleccionar={seleccionar} deshabilitado={ocupado} /><div className="wf-ir-configuracion"><Boton variante="fantasma" disabled={ocupado} onClick={() => { inspector.current?.scrollIntoView({ block: "start" }); inspector.current?.querySelector("select")?.focus({ preventScroll: true }); }}>Configurar paso {indice + 1} seleccionado</Boton></div><Boton variante="fantasma" disabled={ocupado || flujo.nodos.length >= 20} onClick={agregar}>+ Agregar paso al final</Boton>{flujo.nodos.length >= 20 && <p className="wf-ayuda">Alcanzaste el máximo de 20 pasos.</p>}</section>
      <fieldset ref={inspector} className="wf-inspector" disabled={ocupado}>
        <legend>Configurar paso {indice + 1}</legend>
        <p className="wf-ayuda">Seleccionado: {nodo.nombre || "Paso sin nombre"}</p>
        <label>Tipo del paso<select aria-label="Tipo del paso" value={nodo.tipo} onChange={e => actualizar({ tipo: e.target.value as Nodo["tipo"] })}>{Object.entries(tiposNodo).map(([valor, tipo]) => <option key={valor} value={valor}>{tipo.nombre}</option>)}</select></label>
        <p className="wf-ayuda">{tiposNodo[nodo.tipo].ayuda}</p>
        <label>Nombre del paso<input required maxLength={90} value={nodo.nombre} onChange={e => actualizar({ nombre: e.target.value })} /></label>
        {["agente", "aviso", "revision"].includes(nodo.tipo) && <label>{nodo.tipo === "agente" ? "Instrucción para la IA" : "Texto para revisar"}<textarea rows={5} maxLength={4000} value={nodo.texto ?? ""} onChange={e => actualizar({ texto: e.target.value })} /></label>}
        {nodo.tipo === "condicion" && <label>Continuar cuando el paso anterior<select aria-label="Continuar cuando el paso anterior" value={nodo.esperado ?? "correcto"} onChange={e => actualizar({ esperado: e.target.value as Nodo["esperado"] })}><option value="correcto">Se haya completado correctamente</option><option value="error">Haya terminado con error</option></select></label>}
        {nodo.tipo === "agente" && <><label>Conexión del paso<select aria-label="Conexión del paso" value={nodo.proveedorId ?? ""} onChange={e => actualizar({ proveedorId: e.target.value })}><option value="">Heredar conexión de la empresa</option>{nodo.proveedorId && !conexiones.some(c => c.id === nodo.proveedorId) && <option value={nodo.proveedorId}>Conexión guardada (no disponible en esta vista)</option>}{conexiones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Modelo opcional<input maxLength={150} placeholder="Vacío: heredar modelo de la conexión" value={nodo.modelo ?? ""} onChange={e => actualizar({ modelo: e.target.value })} /></label></>}
        <div className="wf-orden"><Boton variante="fantasma" disabled={ocupado || indice === 0} onClick={() => mover(-1)}>↑ Mover antes</Boton><Boton variante="fantasma" disabled={ocupado || indice === claves.length - 1} onClick={() => mover(1)}>↓ Mover después</Boton></div>
        <Boton variante="peligro" disabled={ocupado || claves.length <= 1} onClick={quitar}>Quitar paso seleccionado</Boton>
        <p className="wf-ayuda">Debe quedar al menos un paso. Las flechas se actualizan con el orden; las condiciones conservan su configuración.</p>
      </fieldset>
    </div>
    <p role="status" className="wf-ayuda">{ocupado ? "Guardando workflow…" : anuncio}</p>
    {!modulos.some(m => m.id === (flujo.modulo ?? "workflows") && m.habilitado) && <p role="status" className="wf-ayuda">Selecciona un módulo habilitado para guardar este workflow.</p>}
    <div className="wf-acciones"><Boton type="submit" disabled={ocupado || !modulos.some(m => m.id === (flujo.modulo ?? "workflows") && m.habilitado)}>Guardar workflow</Boton><Boton variante="fantasma" disabled={ocupado} onClick={onCancelar}>Cancelar edición</Boton></div>
    <p className="wf-ayuda">Guardar actualiza el flujo para nuevas ejecuciones. El historial conserva sus pasos originales.</p>
  </form>;
}
