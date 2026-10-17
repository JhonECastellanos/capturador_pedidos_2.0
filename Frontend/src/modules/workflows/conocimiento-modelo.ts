export type FuenteConocimiento = {
  id: string; nombre: string; tipo: "md" | "api" | "postgres";
  texto: string; conexion: string; tabla: string;
};
export type ConfigConocimiento = {
  version: number; perfil: "restaurante" | "tienda" | "supermercado" | "carniceria" | "otro";
  nombreNegocio: string; descripcion: string; reglas: string;
  fuentes: FuenteConocimiento[]; modulos: string[]; publicado: boolean;
};
export type ConexionConocimiento = { id: string; nombre: string; tablas: string[] };
export type ResultadoSimulador = {
  respuesta: string; pasos: Array<{ nombre: string; estado: string; detalle?: string }>;
  fuentes: Array<{ id: string; nombre: string }>; version: number; conversacion: string;
};
export type ModuloWorkflow = { id: string; nombre: string; habilitado: boolean };
export const LIMITE_DOCUMENTO = 20_000;
export const LIMITE_REGLAS = 12_000;
export const LIMITE_FUENTES = 12;

/** Conserva el documento completo: nunca trunca silenciosamente un archivo. */
export async function leerMarkdown(archivo: File): Promise<string> {
  if (!/\.md$/i.test(archivo.name)) throw new Error("Elige un archivo Markdown (.md).");
  if (archivo.size > LIMITE_DOCUMENTO) throw new Error("El archivo supera el máximo de 20.000 bytes.");
  const texto = await archivo.text();
  if (texto.length > LIMITE_DOCUMENTO) throw new Error("El documento supera los 20.000 caracteres.");
  return texto;
}

export function validarConocimiento(config: ConfigConocimiento, conexiones: ConexionConocimiento[], modulos: ModuloWorkflow[]): string {
  if (!config.nombreNegocio.trim()) return "Escribe el nombre del negocio.";
  if (config.nombreNegocio.length > 100) return "El nombre del negocio admite hasta 100 caracteres.";
  if (config.descripcion.length > 2000) return "La descripción admite hasta 2.000 caracteres.";
  if (config.reglas.length > LIMITE_REGLAS) return "Las reglas admiten hasta 12.000 caracteres.";
  if (config.fuentes.length > LIMITE_FUENTES) return "Puedes configurar hasta 12 fuentes.";
  if (new Set(config.fuentes.map(f => f.id)).size !== config.fuentes.length) return "No repitas identificadores de fuentes.";
  if (config.fuentes.some(f => f.texto.length > LIMITE_DOCUMENTO)) return "Cada documento admite hasta 20.000 caracteres.";
  if (config.modulos.some(id => !modulos.some(m => m.id === id && m.habilitado))) return "Retira los módulos no habilitados antes de guardar.";
  for (const fuente of config.fuentes) {
    if (!fuente.nombre.trim()) return "Escribe el nombre de cada fuente.";
    if (fuente.nombre.length > 100) return "El nombre de cada fuente admite hasta 100 caracteres.";
    if (fuente.tipo !== "md") {
      const conexion = conexiones.find(c => c.id === fuente.conexion);
      if (!conexion) return `Elige una conexión disponible para ${fuente.nombre}.`;
      if (fuente.tipo === "postgres" && !conexion.tablas.includes(fuente.tabla)) return `Elige una tabla autorizada para ${fuente.nombre}.`;
    }
  }
  return "";
}
