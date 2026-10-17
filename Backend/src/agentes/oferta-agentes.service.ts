import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { OfertaAgentesEsquema, problemaConexionAgente, type OfertaAgentes, type OfertaAgentesPublica } from "@abinova/contrato";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { validarDestino } from "./proveedores";
import { cifrar, descifrar } from "./configuracion-cifrada";

@Injectable()
export class OfertaAgentesService {
  constructor(private readonly prisma: PrismaService) {}
  private async leer() {
    const r = await this.prisma.configuracionAgente.findUnique({ where: { id: "oferta-incluida" } });
    if (r) return { oferta: OfertaAgentesEsquema.parse(r.configuracion), secretos: descifrar(r.secretos), version: r.version };
    // Compatibilidad con la conexión privada ya instalada; guardar la oferta la sustituye.
    try {
      const anterior = JSON.parse(readFileSync(process.env.WORKFLOW_INCLUDED_PROVIDER_FILE ?? "/run/workflows/proveedor-incluido.json", "utf8"));
      const h = createHash("sha256").update(String(anterior.id ?? "incluido")).digest("hex");
      const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
      const oferta = OfertaAgentesEsquema.parse({ conexiones: [{ ...anterior, id, activo: true, modelos: [{ id: anterior.modelo, nombre: anterior.modelo, modo: "hibrido" }] }] });
      return { oferta, secretos: { [id]: String(anterior.apiKey ?? "") }, version: 0 };
    } catch { return { oferta: { conexiones: [] } as OfertaAgentes, secretos: {} as Record<string, string>, version: 0 }; }
  }
  async configuracion(): Promise<OfertaAgentesPublica> {
    const r = await this.leer();
    return { version: r.version, conexiones: r.oferta.conexiones.map(({ apiKey: _clave, borrarClave: _borrar, ...c }) => ({ ...c, tieneClave: !!r.secretos[c.id] })) };
  }
  async guardar(body: unknown, version: number) {
    const oferta = OfertaAgentesEsquema.parse(body);
    if (new Set(oferta.conexiones.map(c => c.id)).size !== oferta.conexiones.length) throw new ErrorDominio("OFERTA_DUPLICADA", "Cada conexión debe tener un identificador diferente");
    for (const c of oferta.conexiones) {
      const problema = problemaConexionAgente(c);
      if (problema) throw new ErrorDominio("OFERTA_CONEXION", problema);
      await validarDestino(c.url, false);
      if (c.protocolo === "ollama") throw new ErrorDominio("OFERTA_CONEXION", "La oferta incluida utiliza proveedores remotos; Local se configura en el negocio");
      if (c.modelos.some(m => m.modo === "live") && !c.modelo.trim()) throw new ErrorDominio("OFERTA_TEXTO", "Indica el modelo de texto que interpreta las operaciones del negocio");
      if (new Set(c.modelos.map(m => m.id)).size !== c.modelos.length) throw new ErrorDominio("OFERTA_MODELO", "No repitas modelos dentro de la misma conexión");
      if (c.modelos.some(m => m.modo === "live") && new URL(c.url).hostname !== (c.protocolo === "gemini" ? "generativelanguage.googleapis.com" : "api.openai.com")) throw new ErrorDominio("OFERTA_LIVE", "El audio nativo requiere el dominio oficial del proveedor");
      if (c.modelos.some(m => m.modo === "live") && !["gemini", "openai"].includes(c.protocolo)) throw new ErrorDominio("OFERTA_LIVE", "El audio nativo admite Gemini Live y OpenAI Realtime");
    }
    await this.prisma.enTransaccion(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('configuracion:oferta-incluida'))`;
      const anterior = await this.leer();
      if (anterior.version !== version) throw new ErrorDominio("OFERTA_CAMBIO", "La oferta cambió. Recarga antes de guardar", 409);
      const secretos: Record<string, string> = {};
      for (const c of oferta.conexiones) {
        const clave = c.borrarClave ? "" : c.apiKey?.trim() || anterior.secretos[c.id];
        if (c.activo && !clave) throw new ErrorDominio("OFERTA_CLAVE", `Guarda una clave o deshabilita ${c.nombre}`);
        if (clave) secretos[c.id] = clave;
      }
      const configuracion = { conexiones: oferta.conexiones.map(({ apiKey: _clave, borrarClave: _borrar, ...c }) => c) } as Prisma.InputJsonValue;
      await tx.configuracionAgente.upsert({ where: { id: "oferta-incluida" }, create: { id: "oferta-incluida", configuracion, secretos: cifrar(secretos) }, update: { configuracion, secretos: cifrar(secretos), version: { increment: 1 } } });
    });
    return this.configuracion();
  }
  async modelos() {
    const r = await this.leer();
    return r.oferta.conexiones.filter(c => c.activo && r.secretos[c.id]).flatMap(c => c.modelos.map(m => ({ ...m, proveedorId: c.id, proveedor: c.nombre })));
  }
  async elegir(id?: string | null, modelo?: string) {
    const r = await this.leer();
    const c = r.oferta.conexiones.find(c => c.activo && r.secretos[c.id] && (!id || c.id === id) && (!modelo || c.modelos.some(m => m.id === modelo)));
    const m = c?.modelos.find(m => !modelo || m.id === modelo);
    if (!c || !m) throw new ErrorDominio("OFERTA_NO_DISPONIBLE", "El operador no tiene habilitado este modelo. Elige otro modelo incluido o tu propia API", 409);
    return { ...c, modeloTexto: c.modelo, modelo: m.id, modo: m.modo, voz: m.voz, apiKey: r.secretos[c.id] };
  }
}
