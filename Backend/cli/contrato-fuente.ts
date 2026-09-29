import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Índice de endpoints extraído del propio código de los controladores.
 *
 * Se lee el código y no una lista mantenida a mano porque esa lista se
 * desactualiza en silencio: añadir una ruta y olvidar anotarla hace que el
 * generador de pruebas proponga casos contra algo que no existe.
 */

export interface Endpoint {
  metodo: string;
  ruta: string;
  descripcion: string;
  archivo: string;
}

const VERBOS = ["Get", "Post", "Patch", "Put", "Delete"];

/** Busca la carpeta src del backend desde donde se ejecuta el CLI. */
function localizarSrc(): string | null {
  const candidatos = [join(process.cwd(), "src"), join(process.cwd(), "..", "src"), join(process.cwd(), "Backend", "src")];
  return candidatos.find((c) => existsSync(c) && statSync(c).isDirectory()) ?? null;
}

function controladoresEn(carpeta: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(carpeta)) {
    const completa = join(carpeta, entrada);
    if (statSync(completa).isDirectory()) encontrados.push(...controladoresEn(completa));
    else if (entrada.endsWith(".controller.ts")) encontrados.push(completa);
  }
  return encontrados;
}

/** Extrae las rutas de los controladores, con su descripción. */
export function leerEndpoints(): Endpoint[] {
  const src = localizarSrc();
  if (!src) return [];

  const endpoints: Endpoint[] = [];

  for (const archivo of controladoresEn(src)) {
    const codigo = readFileSync(archivo, "utf8");
    const prefijo = codigo.match(/@Controller\(\s*["'`]([^"'`]*)["'`]/)?.[1] ?? "";

    // Se parte por cada decorador de ruta, para no arrastrar el archivo entero.
    const bloques = codigo.split(/(?=\n\s*@(?:Get|Post|Patch|Put|Delete)\b)/);
    for (const bloque of bloques) {
      const verbo = VERBOS.find((v) => bloque.includes(`@${v}(`));
      if (!verbo) continue;

      const subRuta = bloque.match(new RegExp(`@${verbo}\\(\\s*["'\`]([^"'\`]*)["'\`]?\\s*\\)?`))?.[1] ?? "";
      const completa = `/api/v1${prefijo ? `/${prefijo}` : ""}${subRuta ? `/${subRuta}` : ""}`;

      // El comentario justo antes del decorador suele decir para qué sirve.
      const antes = codigo.slice(0, codigo.indexOf(bloque));
      const comentario = antes.match(/\/\*\*\s*([^*]+?)\s*\*\/\s*(?:@[A-Za-z]+[^\n]*\n)*\s*$/)?.[1]?.trim() ?? "";

      endpoints.push({
        metodo: verbo.toUpperCase(),
        ruta: completa,
        descripcion: comentario,
        archivo: archivo.replace(/^.*[\\/]/, ""),
      });
    }
  }

  return endpoints.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Lista legible, para `cli rutas` y para pasársela al modelo. */
export function listarEndpoints(endpoints: Endpoint[]): string {
  return endpoints
    .map((e) => `${e.metodo.padEnd(6)} ${e.ruta.padEnd(48)} ${e.descripcion}`)
    .join("\n");
}

/** Rutas que llevan variables, para recordar al modelo que las resuelva. */
export function rutasConVariables(endpoints: Endpoint[]): string[] {
  return endpoints.filter((e) => e.ruta.includes(":")).map((e) => e.ruta);
}
