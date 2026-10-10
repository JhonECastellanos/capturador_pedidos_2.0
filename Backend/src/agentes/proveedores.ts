import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { request as requestHttps } from "node:https";
import { request as requestHttp } from "node:http";
import { ErrorDominio } from "../common/errores";
import { InstruccionAgenteEsquema, type ConfiguracionAgente, type EstadoPruebaAgente } from "@ambie/contrato";

type Proveedor = ConfiguracionAgente["proveedores"][number];
type Mensaje = { role: "system" | "user"; content: string };
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
  const direcciones = await validarDestino(p.url, p.protocolo === "ollama");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) {
    if (p.protocolo === "gemini") headers["x-goog-api-key"] = p.apiKey;
    else if (p.protocolo === "anthropic") { headers["x-api-key"] = p.apiKey; headers["anthropic-version"] = "2023-06-01"; }
    else headers.Authorization = `Bearer ${p.apiKey}`;
  }
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
          r.destroy(); reject(new ErrorDominio(status === 429 ? "PROVEEDOR_LIMITE" : "PROVEEDOR_RESPUESTA", status === 429 ? "El proveedor indicó un límite de uso. Revisa la cuota o intenta más tarde" : `El proveedor no pudo responder (HTTP ${status}). Revisa la conexión, el modelo o la clave`, status === 429 ? 429 : 502)); return;
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
export async function modelosProveedor(p: Proveedor): Promise<Array<{ id: string; nombre: string; herramientas: boolean | null; bytes?: number }>> {
  const r = await solicitud(p, p.protocolo === "ollama" ? "/api/tags" : "/models");
  if (p.protocolo === "ollama") return (r.models ?? []).map((m: { name: string; size: number }) => ({ id: m.name, nombre: m.name, bytes: m.size, herramientas: null }));
  if (p.protocolo === "gemini") return (r.models ?? []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent") || m.supportedGenerationMethods?.includes("bidiGenerateContent")).map((m: { name: string; displayName?: string }) => ({ id: m.name.replace(/^models\//, ""), nombre: m.displayName ?? m.name, herramientas: null }));
  return (r.data ?? []).map((m: { id: string; display_name?: string }) => ({ id: m.id, nombre: m.display_name ?? m.id, herramientas: null }));
}
const herramienta = { name: "preparar_operacion", description: "Preparar un borrador sin guardarlo. Conserva todos los campos previos al corregir. Nunca confirmar, cobrar o cambiar stock automáticamente.", parameters: { type: "object", properties: { operacion: { type: "string", enum: ["pedido", "compra", "gasto", "egreso", "precio", "cobro", "estado", "cierre", "conteo", "iniciar-conteo", "finalizar-conteo", "aplicar-conteo"] }, cliente: { type: "string" }, ocasional: { type: "boolean" }, proveedor: { type: "string" }, referencia: { type: "string" }, lineas: { type: "array", items: { type: "object", properties: { producto: { type: "string" }, cantidad: { type: "integer", minimum: 0 }, costoUnitario: { type: "number", minimum: 0 } }, required: ["producto", "cantidad"], additionalProperties: false } }, metodo: { type: "string", enum: ["efectivo", "billetera", "credito"] }, preparacion: { type: "string", enum: ["pendiente", "entregado"] }, estado: { type: "string", enum: ["pendiente", "en-preparacion", "entregado", "cancelado"] }, concepto: { type: "string" }, monto: { type: "number", minimum: 0 }, precio: { type: "number", minimum: 0 }, producto: { type: "string" }, conteoId: { type: "string" }, tipoConteo: { type: "string", enum: ["inicial", "general", "aleatorio"] }, cantidad: { type: "integer", minimum: 0 }, fecha: { type: "string" }, efectivo: { type: "number", minimum: 0 }, billetera: { type: "number", minimum: 0 }, descontarCaja: { type: "boolean" } }, required: ["operacion"], additionalProperties: false } };
export async function interpretarProveedor(p: Proveedor, mensajes: Mensaje[]): Promise<unknown> {
  if (!p.modelo) throw new ErrorDominio("MODELO_FALTANTE", "Selecciona un modelo antes de probar la conversación");
  if (p.protocolo === "gemini") {
    const r = await solicitud(p, `/models/${encodeURIComponent(p.modelo.replace(/^models\//, ""))}:generateContent`, { systemInstruction: { parts: [{ text: mensajes.filter(m => m.role === "system").map(m => m.content).join("\n") }] }, contents: mensajes.filter(m => m.role === "user").map(m => ({ role: "user", parts: [{ text: m.content }] })), tools: [{ functionDeclarations: [herramienta] }], toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [herramienta.name] } }, generationConfig: { temperature: 0 } });
    const llamada = r.candidates?.[0]?.content?.parts?.find((parte: { functionCall?: { name: string } }) => parte.functionCall?.name === herramienta.name);
    if (llamada) return llamada.functionCall.args;
  } else if (p.protocolo === "anthropic") {
    const r = await solicitud(p, "/messages", { model: p.modelo, max_tokens: 2000, temperature: 0, system: mensajes.filter(m => m.role === "system").map(m => m.content).join("\n"), messages: mensajes.filter(m => m.role === "user"), tools: [{ name: herramienta.name, description: herramienta.description, input_schema: herramienta.parameters }], tool_choice: { type: "tool", name: herramienta.name } });
    const llamada = r.content?.find((parte: { type: string; name?: string }) => parte.type === "tool_use" && parte.name === herramienta.name);
    if (llamada) return llamada.input;
  } else {
    const local = p.protocolo === "ollama";
    const r = await solicitud(p, local ? "/api/chat" : "/chat/completions", { model: p.modelo, messages: mensajes, tools: [{ type: "function", function: herramienta }], ...(local ? { stream: false, options: { temperature: 0 }, keep_alive: "2m" } : { temperature: 0, max_tokens: 2000, tool_choice: { type: "function", function: { name: herramienta.name } } }) });
    const mensaje = local ? r.message : r.choices?.[0]?.message;
    const llamada = mensaje?.tool_calls?.find((t: { function?: { name: string } }) => t.function?.name === herramienta.name);
    if (llamada) { try { return typeof llamada.function.arguments === "string" ? JSON.parse(llamada.function.arguments) : llamada.function.arguments; } catch { /* Mensaje controlado abajo. */ } }
  }
  throw new ErrorDominio("MODELO_HERRAMIENTAS", "El modelo no devolvió la operación estructurada. Prueba otro modelo con llamadas a herramientas", 502);
}
export async function probarProveedor(p: Proveedor): Promise<EstadoPruebaAgente> {
  const inicio = Date.now();
  try { const resultado = await interpretarProveedor(p, [{ role: "system", content: "Prueba de conexión. Devuelve preparar_operacion con operacion gasto, concepto Prueba de conexión, monto 1, metodo efectivo. No se ejecuta ninguna escritura." }, { role: "user", content: "Prepara el gasto de prueba" }]); if (!InstruccionAgenteEsquema.safeParse(resultado).success) throw new ErrorDominio("MODELO_HERRAMIENTAS", "El modelo devolvió campos inválidos. Prueba otro modelo", 502); return { estado: "disponible", mensaje: "El modelo respondió con una llamada a herramienta válida. No se guardó ninguna operación", comprobadoEn: new Date().toISOString(), milisegundos: Date.now() - inicio }; }
  catch (e) { return { estado: e instanceof ErrorDominio && e.codigo === "PROVEEDOR_LIMITE" ? "limitado" : "error", mensaje: e instanceof Error ? e.message : "No se pudo comprobar el modelo", comprobadoEn: new Date().toISOString(), milisegundos: Date.now() - inicio }; }
}
