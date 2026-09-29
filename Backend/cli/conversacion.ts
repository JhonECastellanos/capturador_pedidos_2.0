import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ClienteAPI } from "./cliente-api";
import { HERRAMIENTAS, ejecutarHerramienta } from "./herramientas";
import { Mensaje, ProveedorIA } from "./proveedores/tipos";
import { ErrorIA } from "./proveedores/tipos";

/**
 * Conversación con el modelo, con acceso a la API.
 *
 * El bucle es el mismo para todos los proveedores: se le manda el historial
 * con las herramientas declaradas, y si el modelo pide alguna, se ejecuta y
 * se le devuelve el resultado para que decida el siguiente paso.
 */

const SISTEMA = `Eres el asistente de AMBIÉ, una app de ventas para un comercio pequeño en Colombia.

Tu trabajo es ayudar a consultar y registrar lo que el negocio pide:

- Clientes, con su cartera (lo que deben) y su historial de abonos.
- Productos, con precio y existencias.
- Pedidos, que se registran por cliente y por líneas de producto.
- Abonos, que descuentan la deuda del cliente de sus pedidos más antiguos.
- Gastos y el resumen del negocio.

Reglas que debes seguir:

1. Nunca inventes datos. Si no sabes algo, usa una herramienta para consultarlo.
2. Antes de crear un cliente o un pedido, confirma que no exista uno equivalente.
3. Registra un pedido solo cuando el cliente y los productos estén claros.
   Si falta el precio de un producto, búscalo antes de armar la línea.
4. Los montos van en pesos colombianos, sin decimales ni puntos de miles.
5. Al escribir fechas usa el formato aaaa-mm-dd.
6. Si una herramienta falla, explica qué pasó y qué harías al respecto. No lo ocultes.
7. Responde en español de Colombia, con frases cortas. Sin adornos.

Cuando muestres cifras, redondea a pesos y agrupa los miles con puntos para que se lean.`;

export interface OpcionesConversacion {
  proveedor: ProveedorIA;
  modelo: string;
  cliente: ClienteAPI;
  /** Se llama antes de ejecutar una herramienta que modifica datos. */
  pedirConfirmacion?: (nombre: string, argumentos: unknown) => Promise<boolean>;
  salida?: (texto: string) => void;
}

/** Herramientas que escriben datos: piden confirmación antes de correr. */
const ESCRITURA = new Set([
  "crear_cliente",
  "registrar_pedido",
  "registrar_abono",
]);

export async function conversar(pregunta: string, opciones: OpcionesConversacion): Promise<string> {
  const { proveedor, modelo, cliente, pedirConfirmacion, salida } = opciones;
  const escribir = salida ?? ((t: string) => process.stdout.write(t));

  const mensajes: Mensaje[] = [
    { rol: "sistema", contenido: SISTEMA },
    { rol: "usuario", contenido: pregunta },
  ];

  // Tope de vueltas para que un modelo que se equivoca no entre en bucle.
  const MAX_VUELTAS = 8;
  let ultima = "";

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const respuesta = await proveedor.chat(
      modelo,
      mensajes,
      HERRAMIENTAS.map((h) => h.declaracion),
      {},
    );

    if (respuesta.texto) {
      ultima = respuesta.texto;
      escribir(`${respuesta.texto}\n`);
    }

    if (respuesta.llamadas.length === 0) {
      if (respuesta.uso?.total) {
        escribir(`  \x1b[90m(${respuesta.uso.total} tokens)\x1b[0m\n`);
      }
      return ultima;
    }

    mensajes.push({
      rol: "asistente",
      contenido: respuesta.texto ?? "",
      llamadas: respuesta.llamadas,
    });

    for (const llamada of respuesta.llamadas) {
      if (ESCRITURA.has(llamada.nombre) && pedirConfirmacion) {
        const aceptado = await pedirConfirmacion(llamada.nombre, llamada.argumentos);
        if (!aceptado) {
          mensajes.push({
            rol: "herramienta",
            contenido: JSON.stringify({ cancelado: true, motivo: "El usuario no confirmó la operación." }),
            herramienta: { ...llamada, contenido: "", llamada },
          });
          escribir(`\x1b[33m  ⊘ ${llamada.nombre} cancelada.\x1b[0m\n`);
          continue;
        }
      }

      escribir(`\x1b[90m  → ${llamada.nombre}\x1b[0m\n`);
      const { ok, resultado } = await ejecutarHerramienta(cliente, llamada.nombre, llamada.argumentos);

      if (!ok) {
        escribir(`\x1b[31m  ✘ ${JSON.stringify(resultado)}\x1b[0m\n`);
      } else {
        escribir(`\x1b[32m  ✔\x1b[0m\n`);
      }

      mensajes.push({
        rol: "herramienta",
        contenido: JSON.stringify(resultado),
        herramienta: { ...llamada, contenido: JSON.stringify(resultado), llamada },
      });
    }
  }

  return ultima;
}

/** Pide al usuario una línea por vez, con historial acumulativo. */
export async function pedirLinea(texto: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(texto)).trim();
  } finally {
    rl.close();
  }
}

/** Menú de opciones numeradas, con la opción por defecto preseleccionada. */
export async function pedirOpcion<T extends Record<string, string>>(
  texto: string,
  opciones: T,
  porDefecto: keyof T,
): Promise<keyof T> {
  const claves = Object.keys(opciones);
  console.log(`\n${texto}`);
  claves.forEach((clave, i) => console.log(`  ${i + 1}) ${opciones[clave]}`));

  while (true) {
    const respuesta = await pedirLinea(`\nElige [1-${claves.length}] (${claves.indexOf(String(porDefecto)) + 1}): `);
    if (!respuesta) return porDefecto;
    const indice = Number(respuesta) - 1;
    if (indice >= 0 && indice < claves.length) return claves[indice];
    if (claves.includes(respuesta)) return respuesta;
    console.log("  \x1b[33mOpción no válida.\x1b[0m");
  }
}

export { ErrorIA };
