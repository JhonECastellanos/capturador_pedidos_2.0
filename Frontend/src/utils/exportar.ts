import type { Pedido } from "../types";

function escaparCSV(valor: string): string {
  const necesitaComillas = valor.includes(",") || valor.includes('"') || valor.includes("\n");
  const escapado = valor.replace(/"/g, '""');
  return necesitaComillas ? `"${escapado}"` : escapado;
}

export function exportarPedidosCSV(pedidos: Pedido[], nombreCliente: (clienteId: string) => string): void {
  const encabezados = ["Número", "Fecha", "Cliente", "Estado", "Método pago", "Total", "Saldo pendiente", "Líneas", "Vendedor"];
  const filas = pedidos.map((pedido) => {
    const cliente = nombreCliente(pedido.clienteId);
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
    ].map(escaparCSV).join(",");
  });
  const csv = [encabezados.join(","), ...filas].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
