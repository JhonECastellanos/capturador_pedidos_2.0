import { DeclaracionHerramienta, ErrorIA, LlamadaHerramienta, Mensaje, OpcionesLlamada, ProveedorIA, RespuestaIA } from "./tipos";
import { CompatibleOpenAI, pedirJSON } from "./comunes";

/**
 * Groq — capa gratuita generosa y muy rápida.
 * Su API es un subconjunto de la de OpenAI, así que reusa el adaptador común.
 */
class Groq extends CompatibleOpenAI implements ProveedorIA {
  constructor() {
    super(
      "groq",
      "Groq (gratis)",
      "https://api.groq.com/openai/v1/chat/completions",
      "GROQ_API_KEY",
      ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"],
    );
  }
  async chat(m: string, msgs: Mensaje[], t: DeclaracionHerramienta[], o: OpcionesLlamada = {}): Promise<RespuestaIA> {
    return super.chat(m, msgs, t, o, process.env.GROQ_API_KEY ?? "");
  }
  async verificar(clave: string) {
    return super.verificar(clave);
  }
}

/** Google Gemini — gratuita con clave y con herramientas nativas. */
class Gemini implements ProveedorIA {
  readonly id = "gemini";
  readonly nombre = "Google Gemini (gratis)";
  readonly claveDesde = "GEMINI_API_KEY";
  readonly modelosSugeridos = ["gemini-2.0-flash", "gemini-1.5-flash"];
  readonly base = "https://generativelanguage.googleapis.com/v1beta";

  async chat(
    modelo: string,
    mensajes: Mensaje[],
    herramientas: DeclaracionHerramienta[],
    opciones: OpcionesLlamada = {},
  ): Promise<RespuestaIA> {
    const clave = process.env.GEMINI_API_KEY ?? "";
    const url = `${this.base}/models/${modelo}:generateContent?key=${encodeURIComponent(clave)}`;

    // Gemini separa el contenido del "system instruction" y usa otra forma
    // para declarar herramientas, así que se traduce el historial.
    const sistema = mensajes.filter((m) => m.rol === "sistema").map((m) => m.contenido).join("\n\n");
    const contents: any[] = [];

    for (const m of mensajes) {
      if (m.rol === "sistema") continue;

      if (m.rol === "herramienta") {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.herramienta?.nombre,
                response: { resultado: seguro(m.contenido) },
              },
            },
          ],
        });
        continue;
      }

      if (m.rol === "asistente" && m.llamadas?.length) {
        contents.push({
          role: "model",
          parts: m.llamadas.map((c) => ({
            functionCall: { name: c.nombre, args: c.argumentos },
          })),
        });
        // El texto del asistente y sus llamadas van en el mismo turno.
        if (m.contenido) contents[contents.length - 1].parts.push({ text: m.contenido });
        continue;
      }

      contents.push({
        role: m.rol === "asistente" ? "model" : "user",
        parts: [{ text: m.contenido }],
      });
    }

    const cuerpo: Record<string, unknown> = { contents };
    if (sistema) cuerpo.systemInstruction = { parts: [{ text: sistema }] };
    if (herramientas.length > 0) {
      cuerpo.tools = [
        {
          functionDeclarations: herramientas.map((h) => ({
            name: h.nombre,
            description: h.descripcion,
            parameters: limpiarEsquema(h.parametros),
          })),
        },
      ];
    }
    cuerpo.generationConfig = {
      temperature: opciones.temperatura ?? 0.2,
      ...(opciones.maxTokens ? { maxOutputTokens: opciones.maxTokens } : {}),
    };

    const respuesta = await pedirJSON(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: opciones.abortar,
    });

    const partes = respuesta?.candidates?.[0]?.content?.parts ?? [];
    const llamadas: LlamadaHerramienta[] = [];
    let texto = "";
    partes.forEach((p: any, i: number) => {
      if (p.functionCall) {
        llamadas.push({ id: p.functionCall.id ?? `llamada_${i}`, nombre: p.functionCall.name, argumentos: p.functionCall.args ?? {} });
      }
      if (p.text) texto += p.text;
    });

    return {
      texto: texto || undefined,
      llamadas,
      uso: respuesta?.usageMetadata
        ? {
            entrada: respuesta.usageMetadata.promptTokenCount,
            salida: respuesta.usageMetadata.candidatesTokenCount,
            total: respuesta.usageMetadata.totalTokenCount,
          }
        : undefined,
      crudo: respuesta,
    };
  }

  async verificar(clave: string) {
    try {
      const r = await pedirJSON(`${this.base}/models?key=${encodeURIComponent(clave)}`, {
        method: "GET",
        timeoutsMs: 20_000,
      });
      const ids: string[] = (r?.models ?? []).map((m: any) => String(m.name).replace("models/", ""));
      const ok = ids.find((m) => this.modelosSugeridos.includes(m));
      return {
        ok: true,
        detalle: `Clave válida. ${ids.length} modelos disponibles.`,
        modeloSugerido: ok ?? ids.find((m) => m.startsWith("gemini")) ?? "gemini-2.0-flash",
      };
    } catch (error) {
      return { ok: false, detalle: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** Gemini no acepta algunas palabras clave de JSON Schema en sus parámetros. */
function limpiarEsquema(esquema: Record<string, unknown>): Record<string, unknown> {
  const copia = JSON.parse(JSON.stringify(esquema));
  const limpiar = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    // Gemini quiere este juego reducido; el resto lo acepta sin quejarse.
    if (obj.type === "object" && !obj.properties) delete obj.type;
    for (const v of Object.values(obj)) limpiar(v);
  };
  limpiar(copia);
  return copia;
}

function seguro(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return { resultado: texto };
  }
}

/** OpenAI — para quien ya tenga una clave de pago. */
class OpenAI extends CompatibleOpenAI implements ProveedorIA {
  constructor() {
    super(
      "openai",
      "OpenAI",
      "https://api.openai.com/v1/chat/completions",
      "OPENAI_API_KEY",
      ["gpt-4o-mini", "gpt-4o"],
    );
  }
  async chat(m: string, msgs: Mensaje[], t: DeclaracionHerramienta[], o: OpcionesLlamada = {}): Promise<RespuestaIA> {
    return super.chat(m, msgs, t, o, process.env.OPENAI_API_KEY ?? "");
  }
  async verificar(clave: string) {
    return super.verificar(clave);
  }
}

/**
 * Cualquier API compatible con OpenAI (Together, Fireworks, DeepSeek,
 * OpenRouter, LM Studio, vLLM…). Basta con indicar la URL base.
 *
 * Se compone del adaptador común en vez de heredar porque aquí la URL y la
 * clave se resuelven en el momento de usarlas, no al construir el objeto.
 */
class Personalizado implements ProveedorIA {
  readonly id = "personalizado";
  readonly nombre = "API compatible con OpenAI";
  readonly claveDesde = "IA_API_KEY";
  // Puede ser local (LM Studio, vLLM) y no pedir clave.
  readonly sinClave = !process.env.IA_API_KEY;
  readonly modelosSugeridos = (process.env.IA_MODELOS ?? "").split(",").map((m) => m.trim()).filter(Boolean);

  private readonly urlBase = process.env.IA_URL_BASE ?? "http://localhost:11434/v1";
  private readonly modeloPorDefecto = process.env.IA_MODELO ?? "";

  private get url(): string {
    return `${this.urlBase.replace(/\/$/, "")}/chat/completions`;
  }

  private get clave(): string {
    return process.env.IA_API_KEY ?? "";
  }

  get modeloPorDefectoActual(): string {
    return this.modeloPorDefecto || this.modelosSugeridos[0] || "gpt-4o-mini";
  }

  private get motor(): CompatibleOpenAI {
    return new CompatibleOpenAI(this.id, this.nombre, this.url, this.claveDesde, this.modelosSugeridos, this.sinClave);
  }

  async chat(
    modelo: string,
    msgs: Mensaje[],
    t: DeclaracionHerramienta[],
    o: OpcionesLlamada = {},
  ): Promise<RespuestaIA> {
    return this.motor.chat(modelo || this.modeloPorDefectoActual, msgs, t, o, this.clave);
  }

  async verificar(clave: string) {
    return this.motor.verificar(clave || this.clave);
  }
}

/** Ollama local: gratis, sin clave y sin salir del equipo. */
class Ollama implements ProveedorIA {
  readonly id = "ollama";
  readonly nombre = "Ollama local (gratis, sin clave)";
  readonly sinClave = true;
  readonly modelosSugeridos = ["llama3.2", "qwen2.5", "mistral"];
  private readonly base = process.env.OLLAMA_URL ?? "http://localhost:11434";

  async chat(
    modelo: string,
    mensajes: Mensaje[],
    herramientas: DeclaracionHerramienta[],
    opciones: OpcionesLlamada = {},
  ): Promise<RespuestaIA> {
    const herramientasOllama = herramientas.map((h) => ({
      type: "function",
      function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
    }));

    const cuerpo: Record<string, unknown> = {
      model: modelo,
      messages: mensajes.map((m) =>
        m.rol === "herramienta"
          ? { role: "tool", content: m.contenido }
          : m.rol === "asistente" && m.llamadas?.length
            ? {
                role: "assistant",
                content: m.contenido,
                tool_calls: m.llamadas.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.nombre, arguments: JSON.stringify(c.argumentos) },
                })),
              }
            : { role: m.rol, content: m.contenido },
      ),
      stream: false,
      options: { temperature: opciones.temperatura ?? 0.2 },
    };
    if (herramientasOllama.length > 0) cuerpo.tools = herramientasOllama;

    const respuesta = await pedirJSON(`${this.base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: opciones.abortar,
    });

    const mensaje = respuesta?.message;
    const llamadas: LlamadaHerramienta[] = (mensaje?.tool_calls ?? []).map((t: any, i: number) => {
      let argumentos: Record<string, unknown> = {};
      try {
        argumentos = t.function?.arguments ? JSON.parse(t.function.arguments) : {};
      } catch {
        argumentos = {};
      }
      return { id: t.function?.name ?? `llamada_${i}`, nombre: t.function?.name ?? "", argumentos };
    });

    return {
      texto: mensaje?.content || undefined,
      llamadas,
      uso: respuesta
        ? {
            entrada: respuesta.prompt_eval_count,
            salida: respuesta.eval_count,
            total: (respuesta.prompt_eval_count ?? 0) + (respuesta.eval_count ?? 0),
          }
        : undefined,
      crudo: respuesta,
    };
  }

  async verificar(): Promise<{ ok: boolean; detalle: string; modeloSugerido?: string }> {
    try {
      const r = await pedirJSON(`${this.base}/api/tags`, { method: "GET", timeoutsMs: 8_000 });
      const nombres: string[] = (r?.models ?? []).map((m: any) => m.name);
      if (nombres.length === 0) {
        return {
          ok: true,
          detalle: "Ollama responde, pero no tiene modelos descargados. Ejecuta: ollama pull llama3.2",
        };
      }
      const elegido = this.modelosSugeridos.find((m) => nombres.some((n) => n.startsWith(m)));
      return { ok: true, detalle: `${nombres.length} modelos locales.`, modeloSugerido: elegido ?? nombres[0] };
    } catch (error) {
      return {
        ok: false,
        detalle: `No hay Ollama escuchando en ${this.base}. Instálalo o usa otro proveedor. (${
          error instanceof Error ? error.message : String(error)
        })`,
      };
    }
  }
}

/** Catálogo que usa la línea de comandos para sugerir y resolver proveedores. */
export const PROVEEDORES: Record<string, () => ProveedorIA> = {
  gemini: () => new Gemini(),
  groq: () => new Groq(),
  openai: () => new OpenAI(),
  ollama: () => new Ollama(),
  personalizado: () => new Personalizado(),
};

export const NOMBRES_PROVEEDORES: Record<string, string> = {
  gemini: "Google Gemini — gratis con clave",
  groq: "Groq — gratis con clave",
  ollama: "Ollama local — gratis, sin clave",
  openai: "OpenAI — requiere pago",
  personalizado: "Cualquier API compatible con OpenAI",
};

export function obtenerProveedor(id: string): ProveedorIA {
  const fabrica = PROVEEDORES[id];
  if (!fabrica) {
    throw new ErrorIA(
      `Proveedor desconocido: ${id}. Disponibles: ${Object.keys(PROVEEDORES).join(", ")}`,
    );
  }
  return fabrica();
}
