import { ImportarProductosEsquema, type ImportarProductosDTO } from "@ambie/contrato";
import { COLUMNAS_PRODUCTOS_CSV } from "./exportar";

/** Comas/punto y coma, comillas dobles escapadas y saltos dentro de una celda. */
export function leerProductosCSV(texto: string): ImportarProductosDTO["productos"] {
  const contenido = texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const separador = contenido.split("\n")[0].includes(";") ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", comillas = false, cerrada = false;
  for (let i = 0; i <= contenido.length; i++) {
    const c = contenido[i];
    if (comillas) {
      if (c === undefined) throw new Error("Hay una celda con comillas sin cerrar.");
      if (c === '"' && contenido[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') { comillas = false; cerrada = true; }
      else celda += c;
    } else if (c === separador || c === "\n" || c === undefined) {
      fila.push(celda.trim()); celda = ""; cerrada = false;
      if (c !== separador) { if (fila.some(Boolean)) filas.push(fila); fila = []; }
    } else if (c === '"' && !celda && !cerrada) comillas = true;
    else if (cerrada && c.trim()) throw new Error("Hay texto fuera de las comillas de una celda.");
    else celda += c;
  }
  const encabezados = filas.shift() ?? [];
  if (new Set(encabezados).size !== encabezados.length || encabezados.some(c => !COLUMNAS_PRODUCTOS_CSV.includes(c))) throw new Error("Usa las columnas de la plantilla CSV, sin repetir encabezados.");
  if (!["nombre", "precioVenta"].every(c => encabezados.includes(c))) throw new Error("El archivo debe incluir nombre y precioVenta.");
  if (filas.length > 200) throw new Error("Carga hasta 200 productos por archivo.");
  const productos = filas.map((valores, i) => {
    if (valores.length !== encabezados.length) throw new Error(`Fila ${i + 2}: faltan o sobran columnas.`);
    const datos = Object.fromEntries(encabezados.map((c, indice) => [c, valores[indice]]));
    const numerico = (campo: string, obligatorio = false) => {
      const valor = datos[campo];
      if (!valor && !obligatorio) return undefined;
      if (!valor || !/^\d+(?:[.,]\d{1,2})?$/.test(valor)) throw new Error(`Fila ${i + 2}: ${campo} debe ser un número positivo o cero, sin separador de miles.`);
      return Number(valor.replace(",", "."));
    };
    return { codigoInterno: datos.codigoInterno || undefined, nombre: datos.nombre, categoria: datos.categoria || undefined, unidad: datos.unidad || undefined, precioVenta: numerico("precioVenta", true), costoActual: numerico("costoActual"), stock: numerico("cantidadInicial"), stockMinimo: numerico("stockMinimo") };
  });
  const validacion = ImportarProductosEsquema.safeParse({ prepararInicial: false, productos });
  if (!validacion.success) throw new Error(`Revisa el archivo: ${validacion.error.issues[0]?.message ?? "datos inválidos"}.`);
  return validacion.data.productos;
}
