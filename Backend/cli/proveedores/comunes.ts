import { DeclaracionHerramienta, ErrorIA, LlamadaHerramienta, Mensaje, OpcionesLlamada, RespuestaIA } from "./tipos";

/** Llama a un endpoint JSON y normaliza los errores más comunes. */
export async function pedirJSON(
  url: string,
  init: RequestInit & { timeoutsMs?: number },
): Promise<any> {
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), init.timeoutsMs ?? 120_000);
  // Si quien llama pasa su propia señal, se respeta: permite Ctrl+C.
  init.signal?.addEventListener("abort", () => control.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: control.signal });
  } catch (error) {
    if (control.signal.aborted && !init.signal?.aborted) {
      throw new ErrorIA("La solicitud tardó demasiado y se canceló.");
    }
    throw new ErrorIA(
      `No se pudo conectar con ${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(limite);
  }

  const texto = await res.text();
  let cuerpo: any = {};
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    // Algunos proveedores devuelven HTML cuando hay un proxy de por medio.
    throw new ErrorIA(`Respuesta que no es JSON (${res.status}): ${texto.slice(0, 200)}`);
  }

  if (!res.ok) {
    const detalle =
      cuerpo?.error?.message ?? cuerpo?.message ?? cuerpo?.detail ?? JSON.stringify(cuerpo).slice(0, 300);
    throw new ErrorIA(detalle || `El proveedor respondió ${res.status}`, res.status, cuerpo?.error?.code);
  }
  return cuerpo;
}

/**
 * Traduce el historial interno al formato de herramientas de OpenAI.
 *
 * Casi todos los proveedores con salida de tools usan este mismo formato:
 * si tu proveedor lo habla, hereda de `CompatibleOpenAI` y solo defines la
 * URL y el modelo.
 */
export function aFormatoOpenAI(mensajes: Mensaje[], herramientas: DeclaracionHerramienta[]) {
  const salida: any[] = [];

  for (const m of mensajes) {
    if (m.rol === "herramienta") {
      salida.push({
        role: "tool",
        tool_call_id: m.herramienta?.id,
        content: m.contenido,
      });
      continue;
    }

    if (m.llamadas?.length) {
      salida.push({
        role: "assistant",
        content: m.contenido || null,
        tool_calls: m.llamadas.map((c: LlamadaHerramienta) => ({
          id: c.id,
          type: "function",
          function: { name: c.nombre, arguments: JSON.stringify(c.argumentos) },
        })),
      });
      continue;
    }

    salida.push({ role: m.rol, content: m.contenido });
  }

  return {
    messages: salida,
    tools: herramientas.map((h) => ({
      type: "function",
      function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
    })),
  };
}

/** Lee `tool_calls` de una respuesta estilo OpenAI. */
export function leerLlamadasOpenAI(cuerpo: any): LlamadaHerramienta[] {
  const crudas = cuerpo?.choices?.[0]?.message?.tool_calls ?? [];
  return crudas.map((t: any) => {
    let argumentos: Record<string, unknown> = {};
    try {
      argumentos = t.function?.arguments ? JSON.parse(t.function.arguments) : {};
    } catch {
      // Un modelo puede devolver JSON roto; se devuelve vacío y la
      // herramienta validará los campos y avisará de lo que falta.
      argumentos = {};
    }
    return { id: t.id, nombre: t.function?.name ?? "", argumentos };
  });
}

export function leerUsoOpenAI(cuerpo: any) {
  if (!cuerpo?.usage) return undefined;
  return {
    entrada: cuerpo.usage.prompt_tokens,
    salida: cuerpo.usage.completion_tokens,
    total: cuerpo.usage.total_tokens,
  };
}

/** Base común de todo proveedor que hable el dialecto de OpenAI. */
export class CompatibleOpenAI {
  constructor(
    readonly id: string,
    readonly nombre: string,
    readonly url: string,
    readonly claveDesde: string | undefined,
    readonly modelosSugeridos: string[],
    readonly sinClave = false,
  ) {}

  async chat(
    modelo: string,
    mensajes: Mensaje[],
    herramientas: DeclaracionHerramienta[],
    opciones: OpcionesLlamada = {},
    clave = "",
  ): Promise<RespuestaIA> {
    const { messages, tools } = aFormatoOpenAI(mensajes, herramientas);
    const cuerpo: Record<string, unknown> = {
      model: modelo,
      messages,
      // Cuando hay herramientas, algunos proveedores no aceptan una
      // temperatura y una respuesta sin tools a la vez. Se manda baja.
      temperature: opciones.temperatura ?? 0.2,
      stream: false,
    };
    if (opciones.maxTokens) cuerpo.max_tokens = opciones.maxTokens;
    // Sin herramientas, mandar `tools: []` provoca 400 en varios proveedores.
    if (tools.length > 0) cuerpo.tools = tools;

    const cabeceras: Record<string, string> = { "content-type": "application/json" };
    if (!this.sinClave) cabeceras.authorization = `Bearer ${clave}`;

    const respuesta = await pedirJSON(this.url, {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify(cuerpo),
      signal: opciones.abortar,
    });

    const mensaje = respuesta?.choices?.[0]?.message;
    return {
      texto: mensaje?.content ?? undefined,
      llamadas: leerLlamadasOpenAI(respuesta),
      uso: leerUsoOpenAI(respuesta),
      crudo: respuesta,
    };
  }

  /** Comprueba la clave con la lista de modelos, que es barata. */
  async verificar(clave: string): Promise<{ ok: boolean; detalle: string; modeloSugerido?: string }> {
    try {
      const urlModelos = this.url.replace(/\/chat\/completions.*$/, "/models");
      const cabeceras: Record<string, string> = {};
      if (!this.sinClave) cabeceras.authorization = `Bearer ${clave}`;

      const respuesta = await pedirJSON(urlModelos, { method: "GET", headers: cabeceras, timeoutsMs: 20_000 });
      const modelos: string[] = (respuesta?.data ?? []).map((m: any) => m.id).filter(Boolean);
      if (modelos.length === 0) {
        return { ok: true, detalle: "Clave aceptada, pero el proveedor no listó modelos." };
      }
      return {
        ok: true,
        detalle: `Clave válida. ${modelos.length} modelos disponibles.`,
        modeloSugerido: this.elegirModelo(modelos),
      };
    } catch (error) {
      return { ok: false, detalle: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Se queda con un modelo conocido si existe, si no con el primero. */
  protected elegirModelo(disponibles: string[]): string {
    for (const preferido of this.modelosSugeridos) {
      const exacto = disponibles.find((m) => m === preferido);
      if (exacto) return exacto;
    }
    return disponibles[0];
  }
}
