import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { request as requestHttps } from "node:https";
import { request as requestHttp } from "node:http";
import { ErrorDominio } from "../common/errores";
import { InstruccionAgenteEsquema, problemaConexionAgente, type ConfiguracionAgente, type EstadoPruebaAgente, type UsoAgente } from "@synchronic-jo/contrato";

type Proveedor = Omit<ConfiguracionAgente["proveedores"][number], "maxTokens"> & { maxTokens?: number; sesion?: string };
type Mensaje = { role: "system" | "user"; content: string };
export function opcionesExtraccion(p: Pick<Proveedor, "url" | "modelo">) {
  // DeepSeek no admite una herramienta obligatoria en thinking: enabled.
  // Referencia: https://api-docs.deepseek.com/api/create-chat-completion/
  return /^deepseek-(?:v4|flash)/i.test(p.modelo) && ["opencode.ai", "api.deepseek.com"].includes(new URL(p.url).hostname)
    ? { thinking: { type: "disabled" as const } } : {};
}
export function privado(ip: string) {
  const limpio = ip.toLowerCase().replace(/^::ffff:/, "");
  return limpio === "::1" || limpio === "::" || ip.toLowerCase().startsWith("::ffff:") || /^(fc|fd|fe[89ab]|ff|64:ff9b:)/.test(limpio) || /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(limpio);
}
export async function validarDestino(url: string, local = false) {
  const u = new URL(url);
  if (u.username || u.password || u.hash || u.search) throw new ErrorDominio("PROVEEDOR_URL", "Usa una URL base sin credenciales, parámetros ni fragmentos");
  if (local) {
    if (u.origin !== new URL(process.env.OLLAMA_URL ?? "http://voice-agent:11434").origin) throw new ErrorDominio("PROVEEDOR_URL", "Ollama usa únicamente la conexión interna configurada");
    return;
  }
  if (process.env.AGENTES_PROVEEDORES_PRUEBA === "true" && ["localhost", "127.0.0.1"].includes(u.hostname)) return;
  if (u.protocol !== "https:") throw new ErrorDominio("PROVEEDOR_URL", "Los proveedores externos requieren HTTPS");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const direcciones = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!direcciones.length || direcciones.some(d => privado(d.address))) throw new ErrorDominio("PROVEEDOR_URL", "La dirección debe pertenecer a un proveedor público; no se admiten redes privadas");
  return direcciones;
}
async function solicitud(p: Proveedor, ruta: string, cuerpo?: unknown) {
  const problema = problemaConexionAgente(p);
  if (problema && process.env.AGENTES_PROVEEDORES_PRUEBA !== "true") throw new ErrorDominio("PROVEEDOR_CONFIGURACION", problema);
  const direcciones = await validarDestino(p.url, p.protocolo === "ollama");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (new URL(p.url).hostname === "opencode.ai") {
    headers["User-Agent"] = "AMBIE/1.0";
    headers["x-opencode-session"] = p.sesion ?? randomUUID();
  }
  if (p.apiKey) {
    if (p.protocolo === "gemini") headers["x-goog-api-key"] = p.apiKey;
    else if (p.protocolo === "anthropic") headers["x-api-key"] = p.apiKey;
    else headers.Authorization = `Bearer ${p.apiKey}`;
  }
  if (p.protocolo === "anthropic") headers["anthropic-version"] = "2023-06-01";
  // Conectar a la IP validada evita una segunda resolución DNS hacia redes privadas.
  const lookupSeguro: LookupFunction | undefined = direcciones ? (_host, opciones, callback) => {
    const permitidas = direcciones.filter(d => !opciones.family || isIP(d.address) === opciones.family);
    if (!permitidas.length) { callback(new Error("Destino no disponible"), [], 0); return; }
    if (opciones.all) callback(null, permitidas.map(d => ({ address: d.address, family: isIP(d.address) })), 0);
    else callback(null, permitidas[0].address, isIP(permitidas[0].address));
  } : undefined;
  let texto: string;
  try {
    texto = await new Promise<string>((resolve, reject) => {
      const url = new URL(`${p.url.replace(/\/$/, "")}${ruta}`);
      const request = url.protocol === "https:" ? requestHttps : requestHttp;
      const req = request(url, { method: cuerpo === undefined ? "GET" : "POST", headers, lookup: lookupSeguro, signal: AbortSignal.timeout(20000), agent: false }, r => {
        const status = r.statusCode ?? 502;
        if (status < 200 || status >= 300) {
          let bytesError = 0; const partesError: Buffer[] = [];
          r.on("data", (parte: Buffer) => { bytesError += parte.length; if (bytesError <= 8192) partesError.push(parte); else { r.destroy(); reject(errorProveedor(status, "")); } });
          r.on("error", () => reject(errorProveedor(status, "")));
          r.on("end", () => reject(errorProveedor(status, Buffer.concat(partesError).toString("utf8")))); return;
        }
        const partes: Buffer[] = []; let bytes = 0;
        r.on("data", (parte: Buffer) => { bytes += parte.length; if (bytes > 2 * 1024 * 1024) { r.destroy(); reject(new ErrorDominio("PROVEEDOR_RESPUESTA", "La respuesta del proveedor excede el tamaño permitido", 502)); } else partes.push(parte); });
        r.on("error", reject);
        r.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
      });
      req.on("error", reject);
      req.end(cuerpo === undefined ? undefined : JSON.stringify(cuerpo));
    });
  } catch (e) { if (e instanceof ErrorDominio) throw e; throw new ErrorDominio("PROVEEDOR_CONEXION", "No se pudo contactar al proveedor. Tu operación sigue pendiente", 502); }
  try { return JSON.parse(texto); } catch { throw new ErrorDominio("PROVEEDOR_RESPUESTA", "El proveedor devolvió un formato que no se pudo interpretar", 502); }
}
function errorProveedor(status: number, cuerpo: string) {
  // Solo clasifica motivos conocidos. Nunca devuelve el cuerpo privado del proveedor.
  let claveInvalida = false;
  try { const e = JSON.parse(cuerpo).error; claveInvalida = e?.code === "invalid_api_key" || e?.type === "authentication_error" || e?.details?.some((d: { reason?: string }) => d.reason === "API_KEY_INVALID") === true; } catch { /* Respuesta no estructurada. */ }
  if (claveInvalida || status === 401 || status === 403) return new ErrorDominio("PROVEEDOR_CREDENCIALES", "El proveedor rechazó la clave o sus permisos. Usa una clave de ese mismo proveedor y revisa que tenga acceso al modelo", 422);
  if (status === 429) return new ErrorDominio("PROVEEDOR_LIMITE", "El proveedor indicó un límite de uso. Revisa la cuota o intenta más tarde", 429);
  if (status === 404) return new ErrorDominio("PROVEEDOR_RUTA", "El proveedor no encontró esa ruta o modelo. Revisa la URL base, el protocolo y el identificador del modelo", 422);
  if (status >= 400 && status < 500) return new ErrorDominio("PROVEEDOR_PARAMETROS", `El proveedor rechazó la solicitud (HTTP ${status}). Comprueba su protocolo, el modelo y los parámetros admitidos`, 422);
  return new ErrorDominio("PROVEEDOR_RESPUESTA", `El proveedor no pudo responder (HTTP ${status}). Intenta nuevamente más tarde`, 502);
}
type MetadatosModelo = { cost?: { input?: number; output?: number }; tool_call?: boolean; provider?: { npm?: string } };
type CatalogoOpenCode = Record<string, { npm?: string; models?: Record<string, MetadatosModelo> }>;
let catalogoOpenCode: { hasta: number; promesa: Promise<CatalogoOpenCode> } | undefined;
async function metadatosOpenCode(): Promise<CatalogoOpenCode> {
  if (!catalogoOpenCode || catalogoOpenCode.hasta < Date.now()) {
    catalogoOpenCode = { hasta: Date.now() + 300000, promesa: (async () => {
      // Catálogo público fijo: ninguna clave ni dato comercial se envía a este servicio.
      const respuesta = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(10000), redirect: "error" });
      if (!respuesta.ok || !respuesta.body) return {};
      const partes: Uint8Array[] = []; let bytes = 0;
      for await (const parte of respuesta.body) { bytes += parte.length; if (bytes > 8 * 1024 * 1024) throw new Error("Catálogo demasiado grande"); partes.push(parte); }
      return JSON.parse(Buffer.concat(partes).toString("utf8")) as CatalogoOpenCode;
    })().catch(() => ({})) };
  }
  return catalogoOpenCode.promesa;
}
export function precioGratuito(precio: { prompt?: string; completion?: string; request?: string }): boolean {
  const cero = (valor: unknown) => typeof valor === "string" && valor.trim() !== "" && Number(valor) === 0;
  return cero(precio.prompt) && cero(precio.completion) && (precio.request === undefined || cero(precio.request));
}
export async function modelosProveedor(p: Proveedor): Promise<Array<{ id: string; nombre: string; herramientas: boolean | null; gratis?: boolean; incluido?: boolean; protocolo?: Proveedor["protocolo"]; bytes?: number }>> {
  const r = await solicitud(p, p.protocolo === "ollama" ? "/api/tags" : "/models");
  if (p.protocolo === "ollama") return (r.models ?? []).map((m: { name: string; size: number }) => ({ id: m.name, nombre: m.name, bytes: m.size, herramientas: null }));
  if (p.protocolo === "gemini") return (r.models ?? []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent")).map((m: { name: string; displayName?: string }) => ({ id: m.name.replace(/^models\//, ""), nombre: m.displayName ?? m.name, herramientas: null }));
  const esOpenCode = new URL(p.url).hostname === "opencode.ai";
  const esGo = esOpenCode && new URL(p.url).pathname.includes("/zen/go/");
  const metadatos = esOpenCode ? (await metadatosOpenCode())[esGo ? "opencode-go" : "opencode"] : undefined;
  return (r.data ?? []).map((m: { id: string; name?: string; display_name?: string; pricing?: { prompt?: string; completion?: string; request?: string }; supported_parameters?: string[] }) => {
    const detalle = metadatos?.models?.[m.id];
    const sdk = detalle?.provider?.npm ?? metadatos?.npm;
    const protocolo: Proveedor["protocolo"] | undefined = sdk === "@ai-sdk/openai" ? "responses" : sdk === "@ai-sdk/anthropic" ? "anthropic" : sdk === "@ai-sdk/google" ? "gemini" : sdk === "@ai-sdk/openai-compatible" ? "openai" : undefined;
    return {
    ...(detalle?.cost?.input !== undefined && detalle.cost.output !== undefined ? { gratis: detalle.cost.input === 0 && detalle.cost.output === 0 } : {}),
    ...(esGo && detalle ? { incluido: true } : {}), ...(protocolo ? { protocolo } : {}),
    id: m.id, nombre: m.display_name ?? m.name ?? m.id,
    herramientas: m.supported_parameters ? m.supported_parameters.includes("tools") : detalle?.tool_call ?? null,
    ...(new URL(p.url).hostname === "openrouter.ai" && m.pricing ? { gratis: precioGratuito(m.pricing) } : {}),
  }; }).sort((a: { gratis?: boolean }, b: { gratis?: boolean }) => Number(b.gratis === true) - Number(a.gratis === true));
}
const herramienta = { name: "preparar_operacion", description: "Preparar un borrador sin guardarlo. Conserva todos los campos previos al corregir. Nunca confirmar, cobrar o cambiar stock automáticamente.", parameters: { type: "object", properties: { operacion: { type: "string", enum: ["pedido", "compra", "gasto", "egreso", "precio", "cobro", "estado", "cierre", "conteo", "iniciar-conteo", "finalizar-conteo", "aplicar-conteo"] }, cliente: { type: "string" }, ocasional: { type: "boolean", description: "Para cliente ocasional o venta abierta usa true y omite cliente. cliente solo identifica una persona registrada." }, proveedor: { type: "string" }, referencia: { type: "string" }, lineas: { type: "array", items: { type: "object", properties: { producto: { type: "string" }, cantidad: { type: "integer", minimum: 0 }, costoUnitario: { type: "number", minimum: 0 } }, required: ["producto", "cantidad"], additionalProperties: false } }, metodo: { type: "string", description: "Forma de pago indicada por el usuario. Para gastos, egresos, pedidos y cobros. No omitir si se expresó.", enum: ["efectivo", "billetera", "credito"] }, preparacion: { type: "string", enum: ["pendiente", "entregado"] }, estado: { type: "string", enum: ["pendiente", "en-preparacion", "entregado", "cancelado"] }, concepto: { type: "string" }, monto: { type: "number", description: "Importe de gasto, egreso o cobro en pesos. Convierte números escritos en palabras: un peso es 1. No omitir si se expresó.", minimum: 0 }, precio: { type: "number", minimum: 0 }, producto: { type: "string" }, conteoId: { type: "string" }, tipoConteo: { type: "string", enum: ["inicial", "general", "aleatorio"] }, cantidad: { type: "integer", minimum: 0 }, fecha: { type: "string", description: "Fecha expresada por el usuario, YYYY-MM-DD. Omitir si no la indicó.", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, efectivo: { type: "number", description: "Solo para cierre: efectivo contado. En gastos y pedidos usa metodo.", minimum: 0 }, billetera: { type: "number", description: "Solo para cierre: billetera confirmada. En gastos y pedidos usa metodo.", minimum: 0 }, descontarCaja: { type: "boolean" } }, required: ["operacion"], additionalProperties: false } };
export function limpiarInstruccionProveedor(valor: unknown): unknown {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return valor;
  // Un campo opcional vacío significa dato faltante; conservar ceros, false y todas las líneas.
  const limpio = Object.fromEntries(Object.entries(valor).filter(([clave, dato]) => clave === "operacion" || !Object.hasOwn(InstruccionAgenteEsquema.shape, clave) || (dato !== null && dato !== "")));
  if (limpio.operacion === "pedido" && limpio.preparacion === undefined && limpio.estado === "entregado") limpio.preparacion = "entregado";
  if (limpio.operacion === "pedido" && limpio.ocasional === undefined && typeof limpio.cliente === "string" && /^(?:cliente\s+)?oc(?:a|i)sional$|^venta abierta$/i.test(limpio.cliente.trim())) {
    limpio.ocasional = true; delete limpio.cliente;
  }
  return limpio;
}
export async function interpretarProveedor(p: Proveedor, mensajes: Mensaje[], medir?: (uso: UsoAgente) => void): Promise<unknown> {
  if (!p.modelo) throw new ErrorDominio("MODELO_FALTANTE", "Selecciona un modelo antes de probar la conversación");
  if (p.protocolo === "gemini") {
    const r = await solicitud(p, `/models/${encodeURIComponent(p.modelo.replace(/^models\//, ""))}:generateContent`, { systemInstruction: { parts: [{ text: mensajes.filter(m => m.role === "system").map(m => m.content).join("\n") }] }, contents: mensajes.filter(m => m.role === "user").map(m => ({ role: "user", parts: [{ text: m.content }] })), tools: [{ functionDeclarations: [{ name: herramienta.name, description: herramienta.description, parametersJsonSchema: herramienta.parameters }] }], toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [herramienta.name] } }, generationConfig: { temperature: 0, maxOutputTokens: p.maxTokens ?? 2000 } });
    medir?.(usoProveedor(r.usageMetadata, "gemini"));
    const llamada = r.candidates?.[0]?.content?.parts?.find((parte: { functionCall?: { name: string } }) => parte.functionCall?.name === herramienta.name);
    if (llamada) return llamada.functionCall.args;
  } else if (p.protocolo === "responses") {
    const r = await solicitud(p, "/responses", { model: p.modelo, input: mensajes, store: false, max_output_tokens: p.maxTokens ?? 2000, tools: [{ type: "function", name: herramienta.name, description: herramienta.description, parameters: herramienta.parameters, strict: false }], tool_choice: { type: "function", name: herramienta.name } });
    medir?.(usoProveedor(r.usage, "responses"));
    const llamada = r.output?.find((parte: { type: string; name?: string }) => parte.type === "function_call" && parte.name === herramienta.name);
    if (llamada) { try { return typeof llamada.arguments === "string" ? JSON.parse(llamada.arguments) : llamada.arguments; } catch { /* Error controlado abajo. */ } }
  } else if (p.protocolo === "anthropic") {
    const r = await solicitud(p, "/messages", { model: p.modelo, max_tokens: p.maxTokens ?? 2000, temperature: 0, system: mensajes.filter(m => m.role === "system").map(m => m.content).join("\n"), messages: mensajes.filter(m => m.role === "user"), tools: [{ name: herramienta.name, description: herramienta.description, input_schema: herramienta.parameters }], tool_choice: { type: "tool", name: herramienta.name } });
    medir?.(usoProveedor(r.usage, "anthropic"));
    const llamada = r.content?.find((parte: { type: string; name?: string }) => parte.type === "tool_use" && parte.name === herramienta.name);
    if (llamada) return llamada.input;
  } else {
    const local = p.protocolo === "ollama";
    const r = await solicitud(p, local ? "/api/chat" : "/chat/completions", { model: p.modelo, messages: mensajes, tools: [{ type: "function", function: herramienta }], ...(local ? { stream: false, options: { temperature: 0, num_predict: p.maxTokens ?? 2000 }, keep_alive: "2m" } : { temperature: 0, max_tokens: p.maxTokens ?? 2000, tool_choice: { type: "function", function: { name: herramienta.name } }, ...opcionesExtraccion(p) }) });
    medir?.(usoProveedor(local ? r : r.usage, local ? "ollama" : "openai"));
    if (!local && r.choices?.[0]?.finish_reason === "length") throw new ErrorDominio("MODELO_SALIDA_LIMITADA", "El modelo agotó el límite de respuesta antes de completar la operación. Aumenta el máximo de tokens en Ajustes avanzados o elige un modelo con menor consumo", 422);
    const mensaje = local ? r.message : r.choices?.[0]?.message;
    const llamada = mensaje?.tool_calls?.find((t: { function?: { name: string } }) => t.function?.name === herramienta.name);
    if (llamada) { try { return typeof llamada.function.arguments === "string" ? JSON.parse(llamada.function.arguments) : llamada.function.arguments; } catch { /* Mensaje controlado abajo. */ } }
  }
  throw new ErrorDominio("MODELO_HERRAMIENTAS", "El modelo no devolvió la operación estructurada. Prueba otro modelo con llamadas a herramientas", 502);
}
function usoProveedor(datos: Record<string, unknown> | undefined, protocolo: string): UsoAgente {
  if (!datos) return {};
  const entero = (valor: unknown) => typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0 ? valor : undefined;
  const entrada = entero(protocolo === "gemini" ? datos.promptTokenCount : protocolo === "ollama" ? datos.prompt_eval_count : datos.input_tokens ?? datos.prompt_tokens);
  const salida = entero(protocolo === "gemini" ? datos.candidatesTokenCount : protocolo === "ollama" ? datos.eval_count : datos.output_tokens ?? datos.completion_tokens);
  const total = entero(datos.total_tokens ?? datos.totalTokenCount);
  return { ...(entrada !== undefined ? { entrada } : {}), ...(salida !== undefined ? { salida } : {}), ...(total !== undefined ? { total } : {}) };
}
export function permiteRespaldo(error: unknown) { return error instanceof ErrorDominio && ["PROVEEDOR_LIMITE", "PROVEEDOR_CONEXION", "PROVEEDOR_RESPUESTA", "MODELO_SALIDA_LIMITADA", "MODELO_HERRAMIENTAS", "PROVEEDOR_CREDENCIALES"].includes(error.codigo); }
export async function probarProveedor(p: Proveedor): Promise<EstadoPruebaAgente> {
  const inicio = Date.now(); let uso: UsoAgente | undefined;
  try { const resultado = await interpretarProveedor(p, [{ role: "system", content: "Prueba de conexión. Devuelve preparar_operacion con operacion gasto, concepto Prueba de conexión, monto 1, metodo efectivo. No se ejecuta ninguna escritura." }, { role: "user", content: "Prepara el gasto de prueba" }], medida => { uso = medida; }); const validacion = InstruccionAgenteEsquema.safeParse(limpiarInstruccionProveedor(resultado)); if (!validacion.success || validacion.data.operacion !== "gasto" || validacion.data.monto !== 1 || validacion.data.metodo !== "efectivo" || !validacion.data.concepto) throw new ErrorDominio("MODELO_HERRAMIENTAS", "El modelo no conservó los datos del ejercicio: concepto, importe y pago. Prueba otro modelo", 502); return { estado: "disponible", mensaje: "El modelo respondió con una llamada a herramienta válida. No se guardó ninguna operación", comprobadoEn: new Date().toISOString(), milisegundos: Date.now() - inicio, ...(uso && Object.keys(uso).length ? { uso } : {}) }; }
  catch (e) { return { estado: e instanceof ErrorDominio && e.codigo === "PROVEEDOR_LIMITE" ? "limitado" : "error", mensaje: e instanceof Error ? e.message : "No se pudo comprobar el modelo", comprobadoEn: new Date().toISOString(), milisegundos: Date.now() - inicio }; }
}
