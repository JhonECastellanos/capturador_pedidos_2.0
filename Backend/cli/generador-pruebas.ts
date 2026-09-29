import { DeclaracionHerramienta, Mensaje, ProveedorIA, RespuestaIA } from "./proveedores/tipos";
import { ClienteAPI } from "./cliente-api";
import { Endpoint, rutasConVariables } from "./contrato-fuente";

/**
 * Generador de pruebas con IA.
 *
 * Le da al modelo el contrato real de la API y le pide casos de prueba. Cada
 * caso se puede ejecutar de verdad contra una API en marcha, de modo que la
 * salida no es texto decorativo sino comprobación.
 */

const HERRAMIENTA_PRUEBA: DeclaracionHerramienta = {
  nombre: "proponer_pruebas",
  descripcion: "Devuelve la lista de casos de prueba a ejecutar contra la API.",
  parametros: {
    type: "object",
    properties: {
      casos: {
        type: "array",
        description: "Casos de prueba, uno por Endpoint o regla de negocio.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre corto de la prueba." },
            objetivo: { type: "string", description: "Qué se quiere comprobar." },
            metodo: { type: "string", enum: ["GET", "POST", "PATCH", "PUT", "DELETE"] },
            ruta: { type: "string", description: "Ruta con parámetros ya resueltos, p. ej. /api/v1/pedidos/abc123." },
            cuerpo: { type: "object", description: "Cuerpo JSON, si el método lo necesita." },
            esperaFallo: { type: "boolean", description: "true si se espera un error y no un 2xx." },
          },
          required: ["nombre", "objetivo", "metodo", "ruta"],
        },
      },
    },
    required: ["casos"],
  },
};

const SISTEMA_PRUEBAS = `Eres un ingeniero de pruebas que conoce AMBIÉ, una API de ventas Colombian.

Recibes el contrato de la API y devuelves casos de prueba que valen la pena:
- Casos felices: el camino que se recorre todos los días.
- Casos límite: montos en cero, listas vacías, quantities altas.
- Casos de regla de negocio: lo que el sistema NO debe permitir, como un abono
  mayor que la deuda, un pago de más sobre un pedido, o un pedido sin líneas.
- Casos de permiso: un vendedor no puede tocar rutas de administrador.

Reglas:
- Usa rutas reales del contrato. No inventes endpoints.
- Cada caso va contra un caso ya existente (por eso las rutas llevan ids).
- Marca esperaFallo en true cuando el caso debe ser rechazado.
- Escribe los cuerpos con datos concretos, no con marcadores como "valor".
- Máximo 10 casos, ordenados de mayor a menor valor.`;

/** Arma el mensaje que describe la API a probar. */
function contexto(endpoints: Endpoint[]): string {
  const catalogo = endpoints.map((e) => `- ${e.metodo} ${e.ruta}${e.descripcion ? ` — ${e.descripcion}` : ""}`);
  const conVariables = rutasConVariables(endpoints);

  return [
    `Endpoints de la API:`,
    ...catalogo,
    "",
    `Rutas que llevan identificadores y que debes resolver con un id real antes de usarlas:`,
    ...conVariables.map((r) => `- ${r}`),
    "",
    "Cuando propongas un caso sobre una ruta con identificador, mira primero los datos de",
    "la respuesta de un caso anterior para conseguir un id que exista de verdad.",
  ].join("\n");
}

export interface CasoPropuesto {
  nombre: string;
  objetivo: string;
  metodo: string;
  ruta: string;
  cuerpo?: unknown;
  esperaFallo?: boolean;
}

export interface ResultadoEjecutado extends CasoPropuesto {
  estado: number;
  paso: boolean;
  detalle?: string;
  cuerpo?: unknown;
}

/** Le pide al modelo que proponga casos de prueba. */
export async function proponerCasos(
  proveedor: ProveedorIA,
  modelo: string,
  endpoints: Endpoint[],
  instruccionesExtra?: string,
): Promise<CasoPropuesto[]> {
  const mensajes: Mensaje[] = [
    { rol: "sistema", contenido: SISTEMA_PRUEBAS },
    { rol: "usuario", contenido: contexto(endpoints) + (instruccionesExtra ? `\n\n${instruccionesExtra}` : "") },
  ];

  const respuesta: RespuestaIA = await proveedor.chat(modelo, mensajes, [HERRAMIENTA_PRUEBA]);

  const llamada = respuesta.llamadas[0];
  if (!llamada) {
    throw new Error(
      "El modelo no propuso pruebas. Responde con la herramienta proponer_pruebas, o cambia de modelo.",
    );
  }

  const casos = (llamada.argumentos?.casos ?? []) as CasoPropuesto[];
  return casos.filter((c) => c.nombre && c.metodo && c.ruta);
}

/** Ejecuta los casos propuestos y devuelve si cada uno pasó. */
export async function ejecutarCasos(casos: CasoPropuesto[], api: ClienteAPI): Promise<ResultadoEjecutado[]> {
  const resultados: ResultadoEjecutado[] = [];

  for (const caso of casos) {
    try {
      const estado = await api.pedir<any>(caso.metodo, caso.ruta, caso.cuerpo);
      const codigo = estado?.__estado ?? 200;
      resultados.push({ ...caso, estado: codigo, paso: !caso.esperaFallo });
    } catch (error) {
      const err = error as Error & { estado?: number };
      const codigo = err.estado ?? 0;
      // Un caso que debía fallar pasa cuando la API lo rechazó de verdad.
      const paso = caso.esperaFallo ? codigo >= 400 && codigo < 500 : false;
      resultados.push({ ...caso, estado: codigo, paso, detalle: err.message });
    }
  }

  return resultados;
}
