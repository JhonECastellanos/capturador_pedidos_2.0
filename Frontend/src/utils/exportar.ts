import type { Pedido } from "../types";
import type { ProductoDTO } from "@ambie/contrato";

function escaparCSV(valor: string): string {
  const necesitaComillas = valor.includes(",") || valor.includes('"') || valor.includes("\n");
  const escapado = valor.replace(/"/g, '""');
  return necesitaComillas ? `"${escapado}"` : escapado;
}

export function descargarCSV(encabezados: string[], filas: string[][], archivo: string): void {
  const blob = new Blob(["\uFEFF" + [encabezados, ...filas].map(fila => fila.map(escaparCSV).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = archivo;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export const COLUMNAS_PRODUCTOS_CSV = ["codigoInterno", "nombre", "categoria", "unidad", "precioVenta", "costoActual", "cantidadInicial", "stockMinimo"];
export function exportarProductosCSV(productos: ProductoDTO[]): void {
  descargarCSV(COLUMNAS_PRODUCTOS_CSV, productos.map(p => [p.codigoInterno, p.nombre, p.categoria, p.unidad, String(p.precioVenta), String(p.costoActual), String(p.stockFisico ?? p.stock), String(p.stockMinimo)]), "productos.csv");
}

export function exportarPedidosCSV(pedidos: Pedido[], nombreCliente: (clienteId: string) => string): void {
  const encabezados = ["Número", "Fecha", "Cliente", "Estado", "Método pago", "Total", "Saldo pendiente", "Líneas", "Vendedor"];
  const filas = pedidos.map((pedido) => {
    const cliente = pedido.clienteId ? nombreCliente(pedido.clienteId) : "Venta ocasional";
    const lineas = pedido.lineas.map((l) => `${l.cantidad}x ${l.nombre}`).join(" | ");
    return [
      pedido.numero,
      new Date(pedido.creadoEn).toLocaleString("es-CO"),
      cliente,
      pedido.estado,
      pedido.pago.metodo,
      String(pedido.total),
      String(pedido.pago.saldoPendiente),
      lineas,
      pedido.vendedorId,
    ];
  });
  descargarCSV(encabezados, filas, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`);
}
