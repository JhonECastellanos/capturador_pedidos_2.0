import { Injectable } from "@nestjs/common";
import { timingSafeEqual, createHash } from "node:crypto";
import { Usuario } from "@prisma/client";
import { ErrorDominio } from "../common/errores";
import { pedirControlWorkflow, secretoWorkflow as secreto } from "../common/workflow-control";

@Injectable()
export class WorkflowsService {
  private readonly limitesPublicos = new Map<string, { hasta: number; usados: number }>();
  private consultasPublicas = 0;
  async comercial(texto: string, conversacion: string, visitante: string) {
    const ahora = Date.now(), clave = createHash("sha256").update(visitante).digest("hex");
    for (const [k, v] of this.limitesPublicos) if (v.hasta < ahora) this.limitesPublicos.delete(k);
    const contador = this.limitesPublicos.get(clave) ?? { hasta: ahora + 60000, usados: 0 };
    if (contador.usados >= 8 || this.consultasPublicas >= 4 || this.limitesPublicos.size > 2000) throw new ErrorDominio("COMERCIAL_LIMITE", "Espera un momento o continúa por WhatsApp", 429);
    contador.usados++; this.limitesPublicos.set(clave, contador); this.consultasPublicas++;
    try { return await this.pedir("/empresas/comercial/probar", "POST", { texto, conversacion, modulo: "comercial", actor: clave, publico: true }, undefined, true); }
    finally { this.consultasPublicas--; }
  }
  validarBridge(authorization: string | undefined) {
    const esperado = Buffer.from(`Bearer ${secreto(process.env.WORKFLOW_BRIDGE_TOKEN_FILE)}`), recibido = Buffer.from(authorization ?? "");
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) throw new ErrorDominio("WORKFLOWS_ACCESO", "Conexión no autorizada", 401);
  }
  async pedir(ruta: string, metodo = "GET", datos?: unknown, propietario?: string, operador = false) {
    return pedirControlWorkflow(ruta, metodo, datos, propietario, operador);
  }
  async empresas(usuario: Usuario) {
    if (!usuario.esSistema) throw new ErrorDominio("WORKFLOWS_OPERADOR", "Los workflows pertenecen al panel de mando de ABINOVA", 403);
    const lista = await this.pedir("/empresas") as Array<{ id: string; nombre: string }>;
    const permitidas = usuario.esSistema ? lista : lista.filter(e => e.id === (process.env.WORKFLOW_TENANT_ID ?? "principal"));
    return permitidas.map(e => ({ ...e, propia: e.id === (process.env.WORKFLOW_TENANT_ID ?? "principal") }));
  }
  async empresa(usuario: Usuario, id: string, ruta: string, metodo = "GET", datos?: unknown) {
    if (!usuario.esSistema) throw new ErrorDominio("WORKFLOWS_OPERADOR", "Los workflows pertenecen al panel de mando de ABINOVA", 403);
    if (!usuario.esSistema && id !== (process.env.WORKFLOW_TENANT_ID ?? "principal")) throw new ErrorDominio("WORKFLOWS_EMPRESA", "No tienes acceso a otra empresa", 403);
    if (!/^[a-zA-Z0-9_-]{1,70}$/.test(id)) throw new ErrorDominio("WORKFLOWS_EMPRESA", "Empresa inválida");
    // La cuenta técnica conserva su administración de esta instalación.
    // Para empresas remotas se limita al control autorizado por sus propietarios.
    return this.pedir(`/empresas/${id}/${ruta}`, metodo, datos, id === (process.env.WORKFLOW_TENANT_ID ?? "principal") ? id : undefined, usuario.esSistema);
  }
}
