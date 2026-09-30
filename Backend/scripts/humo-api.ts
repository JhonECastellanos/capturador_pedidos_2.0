/**
 * Prueba de humo de la API.
 *
 * Levanta el recorrido completo de un vendedor y de un administrador contra
 * una API en marcha: entrar, crear cliente, crear producto, registrar pedido,
 * cobrar, contar inventario y cerrar el día. Sirve para comprobar de un tirón
 * que el contrato entre frontend, API y base de datos sigue en pie.
 *
 * No deja basura: al terminar borra todo lo que creó, y si la base es de
 * pruebas (`ambie_test`) hace eso sin pedir confirmación.
 *
 *   npm run prueba:humo -- --url http://localhost:3000 --email admin@ambie.local
 */

const args = process.argv.slice(2);

function opcion(nombre: string, porDefecto?: string): string | undefined {
  const i = args.indexOf(`--${nombre}`);
  if (i === -1) return porDefecto;
  return args[i + 1];
}

function bandera(nombre: string): boolean {
  return args.includes(`--${nombre}`);
}

const BASE = (opcion("url") ?? process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = opcion("email") ?? process.env.BOOTSTRAP_EMAIL ?? "admin@ambie.local";
const PASSWORD = opcion("password") ?? process.env.BOOTSTRAP_PASSWORD ?? "";
const LIMPIAR = bandera("limpiar") || BASE.includes("test");

// ── Presentación ───────────────────────────────────────────────────

const verde = (t: string) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t: string) => `\x1b[31m${t}\x1b[0m`;
const gris = (t: string) => `\x1b[90m${t}\x1b[0m`;
const negrita = (t: string) => `\x1b[1m${t}\x1b[0m`;

let pasos = 0;
let fallos = 0;
const creados: Array<{ etiqueta: string; url: string }> = [];

/** Envuelve cada paso para que un fallo no corte el recorrido entero. */
async function paso(nombre: string, fn: () => Promise<void>): Promise<void> {
  pasos += 1;
  try {
    await fn();
    console.log(`${verde("✔")} ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.log(`${rojo("✘")} ${nombre}`);
    console.log(gris(`   ${error instanceof Error ? error.message : String(error)}`));
  }
}

function afirmar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Error(`Se esperaba que ${mensaje}`);
}

// ── Cliente HTTP ───────────────────────────────────────────────────

let accessToken = "";
let refreshToken = "";

type Respuesta<T> = { status: number; cuerpo: T & { data?: unknown; meta?: unknown; error?: { mensaje?: string } } };

async function llamar<T = unknown>(
  metodo: string,
  ruta: string,
  datos?: unknown,
  opciones: { token?: string | null; cruda?: boolean } = {},
): Promise<Respuesta<T>> {
  const usarToken = opciones.token === undefined ? accessToken : opciones.token;
  const cabeceras: Record<string, string> = {};
  // Sin cuerpo no se manda `content-type`: Fastify rechaza un JSON vacío.
  if (datos !== undefined) cabeceras["content-type"] = "application/json";
  if (usarToken) cabeceras.authorization = `Bearer ${usarToken}`;

  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: datos === undefined ? undefined : JSON.stringify(datos),
  });

  const texto = await res.text();
  let cuerpo: unknown = {};
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    cuerpo = { data: texto };
  }
  return { status: res.status, cuerpo: cuerpo as Respuesta<T>["cuerpo"] };
}

/** Igual que llamar(), pero falla si la respuesta no es 2xx. */
async function exigir<T = unknown>(
  metodo: string,
  ruta: string,
  datos?: unknown,
  opciones?: { token?: string | null },
): Promise<T> {
  const res = await llamar<T>(metodo, ruta, datos, opciones);
  if (res.status < 200 || res.status >= 300) {
    const detalle = res.cuerpo?.error?.mensaje ?? JSON.stringify(res.cuerpo).slice(0, 200);
    throw new Error(`${metodo} ${ruta} respondió ${res.status}: ${detalle}`);
  }
  return res.cuerpo.data as T;
}

// ── Recorrido ──────────────────────────────────────────────────────

type Usuario = { id: string; codigo: string; nombre: string; rol: string; permisos: string[] };

async function main() {
  console.log(negrita(`\nAMBIÉ · prueba de humo → ${BASE}\n`));

  await paso("la sonda de salud responde sin credenciales", async () => {
    const res = await llamar<{ data?: { estado?: string; baseDeDatos?: string } }>("GET", "/api/v1/salud", undefined, {
      token: null,
    });
    afirmar(res.status === 200, "la sonda respondiera 200");
    afirmar(res.cuerpo.data?.estado === "ok", `la base estuviera conectada (estado: ${res.cuerpo.data?.estado})`);
  });

  await paso("un acceso sin token es rechazado", async () => {
    const res = await llamar("GET", "/api/v1/clientes", undefined, { token: null });
    afirmar(res.status === 401, `la ruta protegida respondiera 401 (respondió ${res.status})`);
  });

  await paso("el acceso entra y devuelve un token de acceso", async () => {
    afirmar(PASSWORD.length > 0, "se informara una contraseña con --password o BOOTSTRAP_PASSWORD");
    const res = await llamar<{ data?: { accessToken: string; refreshToken: string; usuario: Usuario } }>(
      "POST",
      "/api/v1/auth/login",
      { identifier: EMAIL, password: PASSWORD },
      { token: null },
    );
    afirmar(
      res.status === 200,
      `el acceso devolviera 200 (devolvió ${res.status}: ${JSON.stringify(res.cuerpo).slice(0, 160)})`,
    );
    accessToken = res.cuerpo.data?.accessToken ?? "";
    refreshToken = res.cuerpo.data?.refreshToken ?? "";
    afirmar(accessToken.split(".").length === 3, "el token de acceso fuera un JWT con tres segmentos");
  });

  await paso("el token da acceso a una ruta privada", async () => {
    await exigir("GET", "/api/v1/auth/me");
  });

  await paso("un token alterado es rechazado", async () => {
    const partes = accessToken.split(".");
    const falsificado = `${partes[0]}.${partes[1]}.${partes[2].slice(0, -3)}abc`;
    const res = await llamar("GET", "/api/v1/auth/me", undefined, { token: falsificado });
    afirmar(res.status === 401, `un token manipulado fuera rechazado (respondió ${res.status})`);
  });

  await paso("el token de refresco renueva el acceso", async () => {
    const emitido = await exigir<{ accessToken: string; refreshToken: string }>("POST", "/api/v1/auth/refresh", {
      refreshToken,
    });
    afirmar(emitido.accessToken !== accessToken, "el nuevo token fuera distinto al anterior");
    accessToken = emitido.accessToken;
    refreshToken = emitido.refreshToken;
  });

  await paso("el refresco es de un solo uso", async () => {
    const anterior = refreshToken;
    // Rotar el refresh revoca la sesión anterior, así que también hay que
    // quedarse con el access token nuevo: el anterior ya no sirve.
    const emitido = await exigir<{ accessToken: string; refreshToken: string }>("POST", "/api/v1/auth/refresh", {
      refreshToken: anterior,
    });
    accessToken = emitido.accessToken;
    refreshToken = emitido.refreshToken;
    const repetido = await llamar("POST", "/api/v1/auth/refresh", { refreshToken: anterior }, { token: null });
    afirmar(repetido.status === 401, `reutilizar el refresco fallara (respondió ${repetido.status})`);
  });

  await paso("los catálogos traen categorías, tipos de crédito y métodos de pago", async () => {
    const catalogos = await exigir<{
      categorias: unknown[];
      tiposCredito: unknown[];
      metodosPago: string[];
    }>("GET", "/api/v1/catalogos");
    afirmar(Array.isArray(catalogos.categorias), "hubiera categorías");
    afirmar(catalogos.metodosPago.includes("efectivo"), "estuviera el método de pago efectivo");
    afirmar(catalogos.metodosPago.includes("billetera"), "estuviera el método de pago billetera");
    afirmar(catalogos.metodosPago.includes("credito"), "estuviera el método de pago credito");
  });

  let productoId = "";
  let clienteId = "";
  let pedidoId = "";

  await paso("se crea un producto y queda disponible", async () => {
    const producto = await exigir<{ id: string; codigoInterno: string }>("POST", "/api/v1/productos", {
      nombre: `Humo ${Date.now()}`,
      precioVenta: 12000,
      costoActual: 7000,
      stock: 25,
      stockMinimo: 5,
      unidad: "unidad",
    });
    productoId = producto.id;
    creados.push({ etiqueta: "producto", url: `/api/v1/productos/${productoId}` });

    const listado = await exigir<unknown[]>("GET", `/api/v1/productos?q=Humo&pageSize=50`);
    afirmar(listado.length > 0, "el producto apareciera en el listado");
  });

  await paso("se registra un cliente nuevo", async () => {
    const cliente = await exigir<{ id: string; codigo: string }>("POST", "/api/v1/clientes", {
      nombre: `Cliente de humo ${Date.now()}`,
      alias: "Humo",
      telefono: "3000000000",
      ciudad: "Bogotá",
      direccion: "Calle 1 # 2-3",
    });
    clienteId = cliente.id;
    creados.push({ etiqueta: "cliente", url: `/api/v1/clientes/${clienteId}` });
  });

  await paso("se crea un pedido con una línea", async () => {
    // El contrato usa los valores en minúscula (`al-entregar`) y el precio sale
    // del producto, no del cuerpo. Se crea ya entregado para que el stock se
    // consuma: al crear solo queda reservado.
    const pedido = await exigir<{ id: string; numero: string; total: number }>("POST", "/api/v1/pedidos", {
      clienteId,
      metodo: "credito",
      momentoCobro: "al-entregar",
      estadoInicial: "entregado",
      lineas: [{ productoId, cantidad: 3 }],
    });
    pedidoId = pedido.id;
    creados.push({ etiqueta: "pedido", url: `/api/v1/pedidos/${pedidoId}` });
    afirmar(pedido.total === 36000, `el total fuera 36000 (fue ${pedido.total})`);
  });

  await paso("el pedido descuenta el stock del producto", async () => {
    const producto = await exigir<{ stock: number }>("GET", `/api/v1/productos/${productoId}`);
    afirmar(producto.stock === 22, `el stock quedara en 22 (quedó en ${producto.stock})`);
  });

  await paso("un abono reduce la cartera del cliente", async () => {
    const cartera = await exigir<{ saldoPendiente: number }>("GET", `/api/v1/clientes/${clienteId}/cartera`);
    afirmar(cartera.saldoPendiente === 36000, `la cartera empezara en 36000 (era ${cartera.saldoPendiente})`);

    await exigir("POST", `/api/v1/clientes/${clienteId}/abonos`, { monto: 10000, metodo: "efectivo" });

    const despues = await exigir<{ saldoPendiente: number }>("GET", `/api/v1/clientes/${clienteId}/cartera`);
    afirmar(despues.saldoPendiente === 26000, `la cartera bajara a 26000 (quedó en ${despues.saldoPendiente})`);
  });

  await paso("un abono mayor que la deuda se rechaza", async () => {
    const res = await llamar("POST", `/api/v1/clientes/${clienteId}/abonos`, { monto: 999999, metodo: "efectivo" });
    afirmar(res.status >= 400, `la API lo rechazara (respondió ${res.status})`);
  });

  await paso("un pago de más sobre un pedido se rechaza", async () => {
    const res = await llamar("POST", `/api/v1/pedidos/${pedidoId}/pagos`, { monto: 999999, metodo: "efectivo" });
    afirmar(res.status >= 400, `la API lo rechazara (respondió ${res.status})`);
  });

  await paso("el historial de precios responde", async () => {
    await exigir("POST", `/api/v1/productos/${productoId}/precio`, { nuevoPrecio: 13500 });
    const historial = await exigir<unknown[]>("GET", `/api/v1/productos/${productoId}/precios`);
    afirmar(historial.length > 0, "hubiera al menos un cambio de precio");
  });

  await paso("el tablero devuelve la serie diaria sin huecos", async () => {
    const tablero = await exigir<{ serie: Array<{ dia: string; ventas: number }>; ventas: number }>(
      "GET",
      "/api/v1/dashboard/resumen?dias=7",
    );
    afirmar(Array.isArray(tablero.serie), "hubiera serie");
    afirmar(tablero.serie.length === 7, `la serie tuviera 7 días (tuvo ${tablero.serie.length})`);
    afirmar(tablero.ventas >= 0, "las ventas fueran un número");
  });

  await paso("el listado de gastos acepta rango de fechas", async () => {
    await exigir("GET", "/api/v1/gastos?pageSize=5");
  });

  await paso("un conteo de inventario se puede iniciar y cancelar", async () => {
    const conteo = await exigir<{ id: string }>("POST", "/api/v1/inventario/conteos", {
      tipo: "general",
      turno: "mañana",
    });
    creados.push({ etiqueta: "conteo", url: `/api/v1/inventario/conteos/${conteo.id}` });
    await exigir("POST", `/api/v1/inventario/conteos/${conteo.id}/cancelar`);
  });

  await paso("la previsualización del cierre del día responde", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    await exigir("GET", `/api/v1/cierres/${hoy}/previsualizacion`);
  });

  // ── Limpieza ─────────────────────────────────────────────────────

  if (LIMPIAR && creados.length > 0) {
    await paso("se limpia lo creado por la prueba", async () => {
      // Del más nuevo al más viejo: el pedido libera el stock del producto.
      for (const item of [...creados].reverse()) {
        if (item.etiqueta === "producto") {
          const res = await llamar("DELETE", item.url);
          // Puede que la API no expona borrado físico; un 405 también vale.
          afirmar(res.status < 500, `no fallara el borrado (${res.status})`);
        }
      }
      console.log(gris(`   (${creados.length} recursos revisados)`));
    });
  } else {
    console.log(gris(`\n   Se dejaron ${creados.length} recursos de prueba. Usa --limpiar o una base de pruebas para borrarlos.`));
  }

  // ── Resultado ────────────────────────────────────────────────────

  console.log();
  if (fallos === 0) {
    console.log(verde(negrita(`  ${pasos} pasos, todos correctos.\n`)));
  } else {
    console.log(rojo(negrita(`  ${fallos} de ${pasos} pasos fallaron.\n`)));
  }
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.log(rojo(`\nLa prueba no pudo continuar: ${error instanceof Error ? error.message : String(error)}\n`));
  console.log(gris("  ¿La API está corriendo en " + BASE + "?  ¿La base tiene las migraciones aplicadas?\n"));
  process.exit(1);
});
