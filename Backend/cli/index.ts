#!/usr/bin/env node
/**
 * CLI de AMBIÉ.
 *
 * Dos formas de usarlo:
 *   1. Hablar con la API en lenguaje natural (modo `preguntar`), con el modelo
 *      consultando y registrando datos mediante herramientas.
 *   2. Pedirle al modelo casos de prueba para la API (modo `probar`) y
 *      ejecutarlos de verdad.
 *
 * Funciona con cualquier proveedor de IA. Los gratuitos vienen preconfigurados
 * y solo falta poner la clave; si tienes la tuya, la usas con `--proveedor`.
 */

import { ClienteAPI } from "./cliente-api";
import { ConfigCLI, guardarConfig, leerConfig, ocultar } from "./config-cli";
import { conversar, pedirLinea, pedirOpcion } from "./conversacion";
import { CasoPropuesto, ejecutarCasos, proponerCasos } from "./generador-pruebas";
import { leerEndpoints, listarEndpoints } from "./contrato-fuente";
import { NOMBRES_PROVEEDORES, obtenerProveedor } from "./proveedores/registro";
import { ErrorIA, ProveedorIA } from "./proveedores/tipos";

// ── Presentación ───────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  negrita: "\x1b[1m",
  gris: "\x1b[90m",
  verde: "\x1b[32m",
  rojo: "\x1b[31m",
  amarillo: "\x1b[33m",
  azul: "\x1b[36m",
};

const titulo = (t: string) => console.log(`\n${c.negrita}${c.azul}${t}${c.reset}\n`);

const AYUDA = `
${c.negrita}AMBIÉ · CLI${c.reset}

  ${c.negrita}preguntar${c.reset} <pregunta>      Conversa con los datos del negocio
  ${c.negrita}preguntar${c.reset}                  Conversación interactiva, pregunta a pregunta
  ${c.negrita}probar${c.reset}                     Pide casos de prueba a la IA y los ejecuta
  ${c.negrita}rutas${c.reset}                      Lista los endpoints de la API
  ${c.negrita}proveedores${c.reset}                 Muestra los proveedores de IA disponibles
  ${c.negrita}config${c.reset} [clave=valor]       Guarda proveedor, modelo o clave de API
  ${c.negrita}salir${c.reset}                      Borra la sesión guardada de este equipo

${c.negrita}Opciones${c.reset}
  --api <url>            Dirección de la API          (por defecto ${c.gris}http://localhost:3000${c.reset})
  --proveedor <id>       ${Object.keys(NOMBRES_PROVEEDORES).join(" | ")}
  --modelo <id>          Modelo a usar
  --clave <texto>        Clave de la IA (evita escribirla en el disco)
  --usuario <correo>     Correo para entrar a la API
  --si                    Responde sí a las confirmaciones, sin preguntar

${c.negrita}Ejemplos${c.reset}
  ${c.gris}npm run cli -- preguntar "¿cuánto debe María?"${c.reset}
  ${c.gris}npm run cli -- preguntar --proveedor ollama "registra un pedido de 3 axons"${c.reset}
  ${c.gris}npm run cli -- probar --proveedor gemini${c.reset}
  ${c.gris}npm run cli -- config proveedor=groq${c.reset}
`;

// ── Opciones ───────────────────────────────────────────────────────

function leerOpciones(argv: string[]) {
  const opciones: Record<string, string | boolean> = {};
  const posicionales: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const nombre = token.slice(2);
      const siguiente = argv[i + 1];
      if (siguiente && !siguiente.startsWith("--")) {
        opciones[nombre] = siguiente;
        i += 1;
      } else {
        opciones[nombre] = true;
      }
    } else {
      posicionales.push(token);
    }
  }

  return { opciones, posicionales };
}

/**
 * Pide una clave sin que aparezca en pantalla ni quede en el historial.
 * Node no trae un modo estándar de lectura de secretos, así que se silencia
 * la salida mientras se escribe.
 */
const pedirClaveSecreta = async (texto: string): Promise<string> => {
  process.stdout.write(texto);

  const original = process.stdout.write.bind(process.stdout);
  const silenciado = ((s: string) => original("*")) as typeof process.stdout.write;
  (process.stdout as unknown as { write: typeof process.stdout.write }).write = silenciado;

  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  try {
    const clave = await rl.question("");
    return clave.trim();
  } finally {
    (process.stdout as unknown as { write: typeof process.stdout.write }).write = original;
    rl.close();
    process.stdout.write("\n");
  }
};

// ── Comandos ───────────────────────────────────────────────────────

/**
 * Arma el proveedor y se asegura de que haya clave.
 * Devuelve un `chat` ya enlazado a la clave, para no pasarla en cada llamada.
 */
async function prepararProveedor(config: ConfigCLI, opciones: Record<string, string | boolean>) {
  const idProveedor = String(opciones.proveedor ?? config.proveedor);
  const proveedor = obtenerProveedor(idProveedor);

  let clave = "";
  if (!proveedor.sinClave) {
    const claveOpcion = opciones.clave as string | undefined;
    const variable = proveedor.claveDesde ? process.env[proveedor.claveDesde] : undefined;
    clave = claveOpcion ?? variable ?? config.claves[idProveedor] ?? "";

    if (!clave) {
      titulo(`Falta la clave de ${proveedor.nombre}`);
      console.log(`  Puedes ponerla de tres formas:\n`);
      console.log(`  1. Para esta sesión:  ${c.gris}--clave "tu-clave"${c.reset}`);
      console.log(`  2. Para siempre:      ${c.gris}npm run cli -- config clave_${idProveedor}="tu-clave"${c.reset}`);
      console.log(`  3. En el entorno:     ${c.gris}$env:${proveedor.claveDesde}="tu-clave"${c.reset}\n`);
      clave = await pedirClaveSecreta("  Clave: ");
      if (!clave) throw new ErrorIA("Sin clave no se puede hablar con el modelo.");
      guardarConfig({ ...config, claves: { ...config.claves, [idProveedor]: clave } });
      console.log(`  ${c.verde}Clave guardada en ~/.ambie/cli.json${c.reset}`);
    }
  }

  const modelo = String(opciones.modelo ?? config.modelo ?? proveedor.modelosSugeridos[0] ?? "");

  // El adaptador lee la clave del entorno, pero desde el CLI puede venir de la
  // opción o del archivo de configuración. Se ata aquí para no repetirla.
  const chat = proveedor.chat.bind(proveedor);
  return {
    proveedor,
    modelo,
    chat: (m: string, msgs: any, t: any, o: any) => (chat as any)(m, msgs, t, o, clave),
  };
}

async function asegurarSesion(cliente: ClienteAPI, opciones: Record<string, string | boolean>): Promise<boolean> {
  if (cliente.reanudar()) return true;

  titulo("La API necesita tu usuario");
  const correo = String(opciones.usuario ?? process.env.AMBIE_EMAIL ?? (await pedirLinea("  Correo: ")));
  if (!correo) return false;
  const clave = await pedirClaveSecreta("  Contraseña: ");

  try {
    const nombre = await cliente.entrar(correo, clave);
    guardarConfig({ ...leerConfig(), usuario: { email: correo } });
    console.log(`\n  ${c.verde}Sesión iniciada${c.reset} ${c.gris}como ${nombre}${c.reset}`);
    return true;
  } catch (error) {
    console.log(`\n  ${c.rojo}No se pudo entrar:${c.reset} ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function comandoPreguntar(config: ConfigCLI, opciones: Record<string, string | boolean>, posicionales: string[]) {
  const cliente = new ClienteAPI(config);
  const { proveedor, modelo, chat } = await prepararProveedor(config, opciones);

  if (!(await asegurarSesion(cliente, opciones))) return;

  const preguntar = async (pregunta: string) => {
    await conversar(pregunta, {
      proveedor: { ...proveedor, chat } as ProveedorIA,
      modelo,
      cliente,
      // Nada de escribir en la base sin que alguien lo confirme: el modelo
      // propone y la persona decide.
      pedirConfirmacion: async (nombre, argumentos) => {
        if (opciones.si) return true;
        console.log(`\n  ${c.amarillo}⚠  ${nombre}${c.reset}`);
        console.log(`  ${c.gris}${JSON.stringify(argumentos, null, 2).split("\n").join(`\n  `)}${c.reset}`);
        const respuesta = (await pedirLinea("  ¿Ejecutar? [s/N] ")).toLowerCase();
        return respuesta === "s" || respuesta === "si";
      },
    });
  };

  // Sin pregunta en la línea de comandos: se abre una sesión.
  if (posicionales.length === 0) {
    console.log(`\n  ${c.gris}Escribe tu pregunta. Ctrl+D o "salir" para terminar.${c.reset}\n`);
    while (true) {
      const pregunta = await pedirLinea(`${c.negrita}Tú ›${c.reset} `);
      if (!pregunta) continue;
      if (["salir", "exit", "quit"].includes(pregunta.toLowerCase())) break;
      try {
        await preguntar(pregunta);
      } catch (error) {
        console.log(`  ${c.rojo}Error:${c.reset} ${error instanceof Error ? error.message : String(error)}\n`);
      }
      console.log("");
    }
    return;
  }

  await preguntar(posicionales.join(" "));
}

async function comandoProbar(config: ConfigCLI, opciones: Record<string, string | boolean>, posicionales: string[]) {
  const endpoints = leerEndpoints();
  if (endpoints.length === 0) {
    console.log(`\n  ${c.rojo}No encontré los controladores.${c.reset} Ejecuta el CLI desde ${c.gris}Backend/${c.reset}\n`);
    return;
  }

  titulo(`${endpoints.length} endpoints encontrados`);

  const { proveedor, modelo, chat } = await prepararProveedor(config, opciones);
  const cliente = new ClienteAPI(config);

  console.log(`  ${c.gris}Pidiendo casos a ${proveedor.nombre} (${modelo})…${c.reset}\n`);

  let casos: CasoPropuesto[];
  try {
    casos = await proponerCasos({ ...proveedor, chat } as ProveedorIA, modelo, endpoints, posicionales.join(" "));
  } catch (error) {
    console.log(`  ${c.rojo}El modelo no propuso pruebas:${c.reset} ${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }

  titulo(`${casos.length} casos propuestos`);

  const ejecutar = opciones.si === true || opciones.ejecutar === true;
  if (!ejecutar) {
    casos.forEach((caso, i) => {
      const marca = caso.esperaFallo ? `${c.amarillo}debe fallar${c.reset}` : `${c.verde}debe pasar${c.reset}`;
      console.log(`  ${c.negrita}${i + 1}.${c.reset} ${caso.nombre}  ${c.gris}${caso.metodo} ${caso.ruta}${c.reset}  ${marca}`);
    });
    const r = (await pedirLinea("\n  ¿Ejecutarlos contra la API? [s/N] ")).toLowerCase();
    if (r !== "s" && r !== "si") {
      console.log(`  ${c.gris}No se ejecutó nada.${c.reset}\n`);
      return;
    }
  }

  if (!(await asegurarSesion(cliente, opciones))) return;

  console.log("");
  const resultados = await ejecutarCasos(casos, cliente);

  titulo("Resultado");
  resultados.forEach((r, i) => {
    const marca = r.paso ? `${c.verde}✔ pasó ${c.reset}` : `${c.rojo}✘ falló${c.reset}`;
    console.log(`  ${String(i + 1).padStart(2)}. ${marca} ${c.gris}${r.estado}${c.reset}  ${r.nombre}`);
    if (r.detalle) console.log(`      ${c.gris}${r.detalle}${c.reset}`);
  });

  const buenos = resultados.filter((r) => r.paso).length;
  console.log(
    `\n  ${buenos === resultados.length ? c.verde : c.rojo}${buenos} de ${resultados.length} casos correctos.${c.reset}\n`,
  );
  process.exitCode = buenos === resultados.length ? 0 : 1;
}

function comandoRutas() {
  const endpoints = leerEndpoints();
  if (endpoints.length === 0) {
    console.log(`\n  ${c.amarillo}No encontré controladores.${c.reset} Ejecuta el CLI desde ${c.gris}Backend/${c.reset}\n`);
    return;
  }
  titulo(`${endpoints.length} endpoints`);
  console.log(listarEndpoints(endpoints));
  console.log("");
}

function comandoProveedores() {
  titulo("Proveedores de IA");
  for (const [id, nombre] of Object.entries(NOMBRES_PROVEEDORES)) {
    const marca = id === leerConfig().proveedor ? `${c.verde} ← en uso${c.reset}` : "";
    console.log(`  ${c.negrita}${id.padEnd(14)}${c.reset} ${nombre}${marca}`);
  }
  console.log(`
  ${c.negrita}Sin clave:${c.reset}
  ${c.gris}ollama${c.reset}         Corre en tu equipo, no sale nada a internet.
              Instálalo y descarga un modelo:  ollama pull llama3.2

  ${c.negrita}Con clave gratuita:${c.reset}
  ${c.gris}gemini${c.reset}        console.ai.google.dev → "Get API key" → la pega más rápido.
  ${c.gris}groq${c.reset}          console.groq.com/keys → plan gratuito generoso.

  ${c.negrita}Con tu propia cuenta:${c.reset}
  ${c.gris}personalizado${c.reset}  Cualquier API compatible con OpenAI.
              ${c.gris}npm run cli -- config api="https://tu-servidor/v1" modelo="tu-modelo"${c.reset}
`);
}

function comandoConfig(argumentos: string[]) {
  const config = leerConfig();
  if (argumentos.length === 0) {
    titulo("Configuración actual");
    console.log(`  ${c.gris}api:${c.reset}        ${config.apiUrl}`);
    console.log(`  ${c.gris}proveedor:${c.reset}   ${config.proveedor}`);
    console.log(`  ${c.gris}modelo:${c.reset}     ${config.modelo || `${c.gris}(automático)${c.reset}`}`);
    for (const [id, clave] of Object.entries(config.claves)) {
      console.log(`  ${c.gris}clave_${id}:${c.reset}   ${ocultar(clave)}`);
    }
    console.log(`  ${c.gris}sesión:${c.reset}     ${config.usuario?.email ?? `${c.gris}nadie${c.reset}`}`);
    console.log(`\n  ${c.gris}Se guarda en ~/.ambie/cli.json con permisos solo tuyos.${c.reset}\n`);
    return;
  }

  const nueva: ConfigCLI = { ...config, claves: { ...config.claves } };
  for (const argumento of argumentos) {
    const [clave, ...resto] = argumento.split("=");
    const valor = resto.join("=");
    if (!valor) continue;

    switch (clave) {
      case "api":
        nueva.apiUrl = valor;
        break;
      case "proveedor": {
        if (!NOMBRES_PROVEEDORES[valor]) {
          console.log(`  ${c.rojo}Proveedor desconocido.${c.reset} Usa uno de: ${Object.keys(NOMBRES_PROVEEDORES).join(", ")}`);
          return;
        }
        nueva.proveedor = valor;
        break;
      }
      case "modelo":
        nueva.modelo = valor;
        break;
      case "session":
        // Compatibilidad: se acepta `session` por si alguien ya lo usaba así.
        nueva.apiUrl = valor;
        break;
      default:
        if (clave.startsWith("clave_")) nueva.claves[clave.slice(6)] = valor;
        else console.log(`  ${c.amarillo}Opción desconocida:${c.reset} ${clave}`);
    }
  }

  guardarConfig(nueva);
  console.log(`\n  ${c.verde}Configuración guardada.${c.reset}\n`);
}

function comandoSalir() {
  const config = leerConfig();
  if (config.usuario) delete config.usuario;
  guardarConfig(config);
  console.log(`\n  ${c.verde}Sesión borrada de este equipo.${c.reset}\n`);
}

// ── Entrada ────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const { opciones, posicionales } = leerOpciones(argv);

  if (opciones.ayuda || opciones.help || posicionales.length === 0) {
    console.log(AYUDA);
    return;
  }

  const config = leerConfig();
  if (opciones.api) config.apiUrl = String(opciones.api);

  const comando = posicionales[0];
  const resto = posicionales.slice(1);

  switch (comando) {
    case "preguntar":
    case "pregunta":
    case "chat":
      await comandoPreguntar(config, opciones, resto);
      break;
    case "probar":
    case "pruebas":
      await comandoProbar(config, opciones, resto);
      break;
    case "rutas":
    case "endpoints":
      comandoRutas();
      break;
    case "proveedores":
      comandoProveedores();
      break;
    case "config":
      comandoConfig(resto);
      break;
    case "salir":
      comandoSalir();
      break;
    default:
      console.log(`\n  ${c.rojo}Comando desconocido:${c.reset} ${comando}\n`);
      console.log(AYUDA);
  }
}

main().catch((error) => {
  console.log(`\n  ${c.rojo}${error instanceof Error ? error.message : String(error)}${c.reset}\n`);
  process.exit(1);
});
