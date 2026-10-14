import type { RevisionAgente } from "@synchronic-jo/contrato";
import type { OperacionesContextValue } from "../../context/operaciones-context";
import type { Cliente, EstadoPedido, LineaPedido, LineaRecepcion } from "../../types";
import { api } from "../../data/api";
import { construirPago } from "../../dominio/servicios";
import { fechaLocalStr } from "../../utils/fechas";

/** Adaptador de la revisión a las acciones del negocio; no recalcula saldos ni stock. */
export async function guardarDesdeChat(r: RevisionAgente, o: OperacionesContextValue, usuarioId: string): Promise<boolean> {
  const i = r.instruccion, d = r.datos;
  if (r.faltantes.length || i.operacion === "consulta") return false;
  switch (i.operacion) {
    case "pedido": return !!await o.registrarPedido({ clienteId: (d.cliente as Cliente | null)?.id ?? null, vendedorId: usuarioId,
      lineas: d.lineas as LineaPedido[], total: Number(r.total), estadoInicial: d.entrega as "entregado" | "pendiente", pago: construirPago(i.metodo!, Number(r.total)) });
    case "compra": return !!await o.registrarRecepcion(d.proveedorId as string, d.lineas as LineaRecepcion[], d.descontarCaja as boolean);
    case "gasto": return !!await o.registrarGasto(i.concepto!, i.monto!, i.metodo as "efectivo" | "billetera");
    case "egreso": return (await o.registrarEgresoCaja(i.concepto!, i.monto!, i.metodo as "efectivo" | "billetera")) !== false;
    case "cobro": return !!await o.registrarAbono(d.clienteId as string, i.monto!, i.metodo as "efectivo" | "billetera");
    case "estado": return (await o.actualizarEstadoPedido(d.pedidoId as string, d.estado as EstadoPedido)) !== false;
    case "precio": return (await o.actualizarPrecioProducto(d.productoId as string, i.precio!)) !== false;
    case "iniciar-conteo": return !!await o.iniciarConteo(i.tipoConteo!, i.tipoConteo === "aleatorio" ? 5 : null, "Conteo compartido");
    case "finalizar-conteo": return (await o.finalizarConteoActivo(i.conteoId!)) !== false;
    case "aplicar-conteo": return (await o.aplicarAjusteDeConteo(i.conteoId!)) !== false;
    case "conteo": await api(`/inventario/conteos/${i.conteoId}/lineas/${d.productoId}?resumen=true`, "PATCH", { stockFisico: i.cantidad, contadoEnEsperado: d.contadoEnEsperado }); return true;
    case "cierre": await api(`/cierres/${i.fecha ?? fechaLocalStr(new Date())}`, "POST", { conteoEfectivo: i.efectivo, conteoBilletera: i.billetera }); return true;
  }
}
