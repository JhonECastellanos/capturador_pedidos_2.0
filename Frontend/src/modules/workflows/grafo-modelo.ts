export type Nodo = { tipo: "salud" | "condicion" | "aviso" | "revision" | "agente"; nombre: string; texto?: string; modelo?: string; proveedorId?: string; esperado?: "correcto" | "error" };
export type Flujo = { id: string; nombre: string; ambito: string; version: number; nodos: Nodo[]; privado?: boolean; modulo: string; habilitado?: boolean; estado?: "borrador" | "publicado" | "deshabilitado" };
export type Paso = { nodo: Nodo; estado: string; mensaje?: string; resultado?: { texto?: string } };

export const tiposNodo: Record<Nodo["tipo"], { nombre: string; simbolo: string; ayuda: string }> = {
  salud: { nombre: "Comprobar servicio", simbolo: "+", ayuda: "Comprueba la conexión con el servicio de la empresa." },
  agente: { nombre: "Consultar IA", simbolo: "✦", ayuda: "Consulta el modelo de texto con la conexión y el cupo configurados." },
  condicion: { nombre: "Validar resultado", simbolo: "?", ayuda: "Comprueba el estado del paso anterior. Si no coincide, omite todos los pasos siguientes. En la primera posición evalúa un estado correcto." },
  aviso: { nombre: "Preparar aviso", simbolo: "≡", ayuda: "Prepara un texto para consultar aquí. No envía mensajes externos." },
  revision: { nombre: "Revisión humana", simbolo: "◎", ayuda: "La ejecución automática se detiene antes de este paso. Usa Siguiente paso para revisarlo y continuar." },
};

const estados: Record<string, string> = { pendiente: "Pendiente", ejecutando: "En ejecución", correcto: "Completado", error: "Error", omitido: "Omitido", interrumpido: "Interrumpido", pausada: "En pausa", completada: "Completada", cancelada: "Cancelada", interrumpida: "Interrumpida" };
export function textoEstado(estado: string) { return estados[estado] ?? estado; }
import type { ModuloWorkflow } from "./conocimiento-modelo";


/** El resumen y el acceso de la empresa deben autorizar la ejecución. */
export function puedeEjecutarFlujo(flujo: Flujo, modulos: ModuloWorkflow[]) {
  return flujo.habilitado === true && (flujo.estado ?? "publicado") === "publicado" && modulos.some(m => m.id === (flujo.modulo ?? "workflows") && m.habilitado);
}

/** getRandomValues también funciona al acceder por HTTP desde la red privada. */
export function uuidWorkflow() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
