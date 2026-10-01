import { Injectable } from "@nestjs/common";
import { ConfiguracionAsistenteEsquema, type IntencionAsistente, type RolUsuario } from "@ambie/contrato";
import { ErrorDominio } from "../common/errores";
import { ConfiguracionAsistente } from "./configuracion-asistente";
import { entenderBasico, instruccionesAsistente, validarIntencion, responderCampo } from "./intenciones";
import { pedirProveedor, validarUrlProveedor } from "./red-proveedor";

@Injectable()
export class AsistenteService {
  private activos = 0;
  private turnos = new Map<string, { inicio: number; cantidad: number }>();
  constructor(private readonly configuracion: ConfiguracionAsistente) {}
  async entender(texto: string, rol: RolUsuario, usuarioId: string, pendiente?: IntencionAsistente, campo?: string) {
    const ahora = Date.now();
    for (const [id, turno] of this.turnos) if (ahora - turno.inicio > 60000) this.turnos.delete(id);
    const turno = this.turnos.get(usuarioId) ?? { inicio: ahora, cantidad: 0 };
    if (turno.cantidad >= 30 || this.activos >= 2) throw new ErrorDominio("LIMITE_ASISTENTE", "Espera un momento antes de enviar otra solicitud.", 429);
    turno.cantidad++; this.turnos.set(usuarioId, turno); this.activos++;
    try {
      const config = await this.configuracion.leer();
      const contexto = pendiente ? validarIntencion(pendiente, rol) : undefined;
      if (contexto?.accion) {
        const respuesta = responderCampo(texto, contexto, campo ?? "", rol);
        if (respuesta) return respuesta;
      }
      if (config.proveedor === "basico") return entenderBasico(texto, rol, contexto);
      if (!config.modelo) throw new ErrorDominio("CONFIGURACION", "Selecciona y guarda un modelo desde Configuración.", 503);
      if (!config.clave && config.proveedor !== "compatible") throw new ErrorDominio("CONFIGURACION", "El administrador debe configurar una clave para este proveedor.", 503);
      const sistema = instruccionesAsistente(rol) + (contexto?.accion ? `\nOrden pendiente sin guardar: ${JSON.stringify(contexto)}. Campo preguntado: ${campo ?? "ninguno"}. Actualiza sus campos con la nueva frase. Conserva los anteriores que no cambien. No confirmes ni ejecutes: la confirmación se procesa fuera del modelo.` : "");
      let contenido: string;
      if (config.proveedor === "gemini") {
        const respuesta = await pedirProveedor(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelo)}:generateContent`, { "x-goog-api-key": config.clave || "" }, {
          systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [{ text: texto }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1800, responseMimeType: "application/json" },
        }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        contenido = respuesta.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      } else {
        const base = config.proveedor === "groq" ? "https://api.groq.com/openai/v1" : config.urlBase.replace(/\/$/, "");
        const respuesta = await pedirProveedor(`${base}/chat/completions`, config.clave ? { Authorization: `Bearer ${config.clave}` } : {}, {
          model: config.modelo, messages: [{ role: "system", content: sistema }, { role: "user", content: texto }],
          temperature: 0, max_tokens: 1800, response_format: { type: "json_object" },
        }) as { choices?: Array<{ message?: { content?: string } }> };
        contenido = respuesta.choices?.[0]?.message?.content || "";
      }
      try { return validarIntencion(JSON.parse(contenido.replace(/^```(?:json)?\s*|\s*```$/g, "")), rol); }
      catch { throw new ErrorDominio("INTENCION_INVALIDA", "No se entendió la respuesta del proveedor. Reformula la instrucción o elige una acción.", 502); }
    } finally { this.activos--; }
  }
  private async conexion(entrada?: unknown) {
    const guardada = await this.configuracion.leer();
    if (entrada === undefined) return guardada;
    const datos = ConfiguracionAsistenteEsquema.parse(entrada);
    if (datos.proveedor === "compatible") validarUrlProveedor(datos.urlBase);
    const misma = guardada.proveedor === datos.proveedor && guardada.urlBase === datos.urlBase;
    return { ...datos, clave: datos.borrarClave ? undefined : datos.clave || (misma ? guardada.clave : undefined) };
  }
  async modelos(entrada?: unknown) {
    const config = await this.conexion(entrada);
    if (config.proveedor === "basico") return [];
    if (!config.clave && config.proveedor !== "compatible") throw new ErrorDominio("CONFIGURACION", "Guarda primero la clave del proveedor.");
    if (config.proveedor === "gemini") {
      const modelos = new Set<string>(); let pagina = "";
      const vistas = new Set<string>();
      do {
        const respuesta = await pedirProveedor("https://generativelanguage.googleapis.com/v1beta/models", { "x-goog-api-key": config.clave || "" }, undefined, { pageSize: "100", ...(pagina ? { pageToken: pagina } : {}) }) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }>; nextPageToken?: string };
        for (const m of respuesta.models ?? []) if (m.supportedGenerationMethods?.includes("generateContent") && typeof m.name === "string") modelos.add(m.name.replace(/^models\//, ""));
        pagina = respuesta.nextPageToken ?? "";
        if (vistas.has(pagina)) break;
        vistas.add(pagina);
      } while (pagina && vistas.size < 5);
      return [...modelos].sort();
    }
    const base = config.proveedor === "groq" ? "https://api.groq.com/openai/v1" : config.urlBase.replace(/\/$/, "");
    const respuesta = await pedirProveedor(`${base}/models`, config.clave ? { Authorization: `Bearer ${config.clave}` } : {}) as { data?: Array<{ id: string }> };
    return (respuesta.data ?? []).map((m) => m.id).slice(0, 100);
  }
  async comprobarConexion(entrada: unknown) {
    const config = await this.conexion(entrada);
    if (config.proveedor === "basico") return { disponible: true, mensaje: "Modo básico disponible, sin conexión externa." };
    if (config.proveedor !== "gemini") throw new ErrorDominio("VALIDACION", "Esta comprobación está disponible para Google Gemini.");
    if (!config.clave || !config.modelo) throw new ErrorDominio("CONFIGURACION", "Indica una clave y selecciona un modelo.");
    const respuesta = await pedirProveedor(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelo.replace(/^models\//, ""))}:generateContent`, { "x-goog-api-key": config.clave }, { contents: [{ role: "user", parts: [{ text: 'Responde solo el JSON {"disponible":true}.' }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1024 } }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const texto = respuesta.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("");
    try { if (JSON.parse(texto ?? "").disponible === true) return { disponible: true, mensaje: "Gemini respondió correctamente. No se guardaron datos del negocio." }; } catch {}
    throw new ErrorDominio("PROVEEDOR", "El modelo no devolvió el JSON esperado. Prueba otro modelo de texto.", 502);
  }
}
