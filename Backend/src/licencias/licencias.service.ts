import { Injectable } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";
import { Prisma, Usuario } from "@prisma/client";
import { ACCESO_COMERCIAL_INICIAL, AccesoComercialEsquema, MODULOS_IMPLEMENTADOS, type AccesoComercial, type InstruccionAgente } from "@abinova/contrato";
import { PrismaService } from "../common/prisma.module";
import { pedirControlWorkflow } from "../common/workflow-control";
import { ErrorDominio } from "../common/errores";

@Injectable()
export class LicenciasService {
  private cache?: { hasta: number; datos: AccesoComercial };
  private pendiente?: Promise<AccesoComercial>;
  private generacion = 0;
  private vigentePendiente?: { generacion: number; promesa: Promise<AccesoComercial> };
  constructor(private readonly prisma: PrismaService) {}
  invalidar() { this.generacion++; this.cache = undefined; this.pendiente = undefined; this.vigentePendiente = undefined; }
  private iniciarActualizacion() {
    const promesa = this.actualizar();
    this.pendiente = promesa;
    void promesa.finally(() => { if (this.pendiente === promesa) this.pendiente = undefined; }).catch(() => {});
    return promesa;
  }
  obtener(): Promise<AccesoComercial> {
    if (this.cache) {
      if (Date.now() >= this.cache.hasta && !this.pendiente) {
        void this.iniciarActualizacion().catch(() => { if (this.cache) this.cache.hasta = Date.now() + 5000; });
      }
      return Promise.resolve(this.cache.datos);
    }
    if (!this.pendiente) this.iniciarActualizacion();
    return this.pendiente ?? this.iniciarActualizacion();
  }
  private async actualizar(estricto = false, generacion = this.generacion): Promise<AccesoComercial> {
    const guardado = await this.prisma.configuracionAccesoComercial.findUnique({ where: { id: "principal" } });
    let datos = guardado ? AccesoComercialEsquema.parse(guardado.configuracion) : structuredClone(ACCESO_COMERCIAL_INICIAL);
    try {
      const id = process.env.WORKFLOW_TENANT_ID ?? "principal";
      const recibido = AccesoComercialEsquema.parse(await pedirControlWorkflow(`/empresas/${encodeURIComponent(id)}/acceso`, "GET", undefined, id, false, 2500));
      // El control no puede convertir una función aún no desarrollada en código disponible.
      datos = { ...recibido, modulos: recibido.modulos.map(m => ({ ...m, implementado: MODULOS_IMPLEMENTADOS.includes(m.id), activo: m.activo && MODULOS_IMPLEMENTADOS.includes(m.id) })) };
    } catch (error) { if (estricto) throw error; /* Las lecturas conservan la última política durante una desconexión. */ }
    if (generacion !== this.generacion) return this.actualizar(estricto);
    // No publicar una licencia nueva en RAM si PostgreSQL no pudo conservarla.
    if (!guardado || !isDeepStrictEqual(guardado.configuracion, datos)) await this.prisma.configuracionAccesoComercial.upsert({ where: { id: "principal" }, create: { configuracion: datos as Prisma.InputJsonValue }, update: { configuracion: datos as Prisma.InputJsonValue } });
    if (generacion !== this.generacion) return this.actualizar(estricto);
    this.cache = { hasta: Date.now() + 5000, datos };
    return datos;
  }
  async exigir(usuario: Usuario, modulos: string[]) {
    if (usuario.esSistema || !modulos.length) return;
    const acceso = await this.obtener();
    if (!modulos.some(id => acceso.modulos.some(m => m.id === id && m.activo))) throw new ErrorDominio("MODULO_NO_CONTRATADO", "Este módulo no está habilitado en el plan de tu negocio. Consulta a tu proveedor", 403);
  }
  async exigirVigente(usuario: Usuario, modulos: string[]) {
    if (usuario.esSistema || !modulos.length) return;
    if (!this.vigentePendiente || this.vigentePendiente.generacion !== this.generacion) {
      const actual = { generacion: this.generacion, promesa: this.actualizar(true) };
      this.vigentePendiente = actual;
      void actual.promesa.finally(() => { if (this.vigentePendiente === actual) this.vigentePendiente = undefined; }).catch(() => {});
    }
    const acceso = await this.vigentePendiente.promesa;
    if (!modulos.some(id => acceso.modulos.some(m => m.id === id && m.activo))) throw new ErrorDominio("MODULO_NO_CONTRATADO", "Este módulo ya no está habilitado en tu plan", 403);
  }
  async exigirOperacion(usuario: Usuario, i: InstruccionAgente) {
    const consulta = i.operacion === "consulta";
    const mods = consulta ? ({ productos: ["productos", "inventario", "ventas", "compras"], pedidos: ["pedidos", "ventas"], compras: ["compras"], proveedores: ["compras"], resumen: ["resumen"] } as Record<string, string[]>)[i.recurso ?? ""] : ({ pedido: ["ventas"], estado: ["pedidos"], compra: ["compras"], precio: ["productos"], conteo: ["inventario"], "iniciar-conteo": ["inventario"], "finalizar-conteo": ["inventario"], "aplicar-conteo": ["inventario"], gasto: ["caja"], egreso: ["caja"], cierre: ["cierre"], cobro: ["creditos"] } as Record<string, string[]>)[i.operacion];
    await this.exigir(usuario, mods ?? []);
    if (i.metodo === "credito") await this.exigir(usuario, ["creditos"]);
  }
  async exigirRuta(usuario: Usuario, url: string, metodo: string, cuerpo?: unknown) {
    const ruta = url.split("?")[0].replace(/^\/api\/v1\//, ""), area = ruta.split("/")[0];
    const candidatos = ({ dashboard: ["resumen"], inventario: ["inventario"], compras: ["compras"], "recepciones-compra": ["compras"], proveedores: ["compras"], caja: ["caja"], gastos: ["caja"], cierres: ["cierre"], usuarios: ["usuarios"], auditoria: ["auditoria"], notificaciones: ["notificaciones"], workflows: ["workflows"], pagos: ["creditos", "ventas"], abonos: ["creditos"], clientes: ["ventas", "creditos"], productos: metodo === "GET" ? ["productos", "ventas", "inventario", "compras"] : ["productos", "compras", "inventario"], pedidos: metodo === "POST" && ruta === "pedidos" ? ["ventas"] : ["pedidos", "ventas", "creditos"], agentes: [ruta === "agentes/chat" ? "chat" : "agentes"] } as Record<string, string[]>)[area];
    await this.exigir(usuario, candidatos ?? []);
    if (/\/(?:abonos|pagos)(?:\/|$)/.test(ruta)) await this.exigir(usuario, ["creditos", "ventas"]);
    if (cuerpo && typeof cuerpo === "object" && "metodo" in cuerpo && cuerpo.metodo === "credito") await this.exigir(usuario, ["creditos"]);
  }
}
