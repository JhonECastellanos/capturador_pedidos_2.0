import { Injectable } from "@nestjs/common";
import { Usuario } from "@prisma/client";
import { InstruccionAgente, type RevisionAgente } from "@synchronic-jo/contrato";
import { AgentesService } from "./agentes.service";
import { ProductosService } from "../productos/productos.service";
import { PedidosService } from "../pedidos/pedidos.service";
import { ComprasService } from "../compras/compras.service";
import { DashboardService } from "../dashboard/dashboard.service";
import { ErrorDominio } from "../common/errores";
import { rangoPeriodo } from "../common/periodo";

@Injectable()
export class ChatService {
  constructor(private readonly agentes: AgentesService, private readonly productos: ProductosService, private readonly pedidos: PedidosService, private readonly compras: ComprasService, private readonly dashboard: DashboardService) {}
  async responder(texto: string, usuario: Usuario, anterior?: InstruccionAgente, id?: string, version?: number, conversacionId?: string) {
    const revision = await this.agentes.interpretar(texto, anterior, usuario, id, version, undefined, conversacionId);
    if (revision.instruccion.operacion !== "consulta") return { respuesta: revision.resumen, revision, resultados: [] };
    return this.consultar(revision, usuario);
  }
  async consultar(revision: RevisionAgente, usuario: Usuario) {
    if (usuario.rol !== "ADMINISTRADOR" || !usuario.esSistema && usuario.permisosDenegados.includes("chat")) throw new ErrorDominio("CHAT_PERMISO", "Esta consulta requiere acceso al chat del administrador", 403);
    if (!revision.instruccion.recurso) return { respuesta: revision.resumen, resultados: [] };
    const i = revision.instruccion, permiso = i.recurso === "productos" || i.recurso === "compras" || i.recurso === "proveedores" ? "inventario" : i.recurso === "pedidos" ? "pedidos" : "caja";
    if (!usuario.esSistema && usuario.permisosDenegados.includes(permiso)) throw new ErrorDominio("CHAT_PERMISO", "Tu acceso no permite consultar este módulo", 403);
    const q = i.busqueda ?? "", resultados: Array<{ titulo: string; detalle: string; ruta: string }> = [];
    let total = 0;
    if (i.recurso === "productos") {
      const lista = await this.productos.listar(q, undefined, undefined, 1, 10, "nombre", true); total = lista.meta.total;
      resultados.push(...lista.data.map(p => ({ titulo: p.nombre, detalle: `${p.stock} disponibles · ${p.codigoInterno}`, ruta: "/admin/inventario" })));
    } else if (i.recurso === "pedidos") {
      const lista = await this.pedidos.listar({ q, periodo: i.periodo ?? "hoy", pagina: 1, porPagina: 10 }); total = lista.meta.total;
      resultados.push(...lista.data.map(p => ({ titulo: p.numero, detalle: `${p.estado} · $${p.total}`, ruta: `/admin/ventas/pedido/${p.id}` })));
    } else if (i.recurso === "compras") {
      const lista = await this.compras.listarRecepciones(1, 10, q, i.periodo ?? "todo"); total = lista.meta.total;
      resultados.push(...lista.data.map(p => ({ titulo: p.numero, detalle: `${p.proveedor} · $${p.total}`, ruta: `/admin/compras?recepcion=${p.id}` })));
    } else if (i.recurso === "proveedores") {
      const lista = await this.compras.listarProveedores(1, 10, q); total = lista.meta.total;
      resultados.push(...lista.data.map(p => ({ titulo: p.nombre, detalle: "Proveedor registrado", ruta: "/admin/compras" })));
    } else if (i.recurso === "resumen") {
      const rango = rangoPeriodo(i.periodo ?? "hoy", true);
      const r = await this.dashboard.resumen(rango ? { desde: rango.gte.toISOString().slice(0, 10), ...(rango.lt ? { hasta: new Date(rango.lt.getTime() - 1).toISOString().slice(0, 10) } : {}) } : { desde: "1900-01-01" });
      resultados.push({ titulo: "Resumen del negocio", detalle: `Ventas: $${r.ventas} · Pedidos: ${r.pedidos} · Ticket: $${r.ticketPromedio}`, ruta: "/admin" }); total = 1;
    }
    return { respuesta: i.recurso ? total ? `Encontré ${total} registro${total === 1 ? "" : "s"}. ${total > 10 ? "Estos son los primeros diez." : ""}`.trim() : "No encontré registros con esa búsqueda." : revision.resumen, resultados, consultadoEn: new Date().toISOString() };
  }
}
