import type { OperacionesContextValue } from "../../context/operaciones-context";
import { ACCIONES_ASISTENTE, type AccionAsistente } from "@ambie/contrato";

const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function resolverReferencia(valor: unknown, opciones: Array<{ id: string; nombre: string }>): string {
  if (typeof valor !== "string") return "";
  const exacta = opciones.find((o) => o.id === valor);
  if (exacta) return exacta.id;
  const coinciden = opciones.filter((o) => normalizar(o.nombre) === normalizar(valor));
  return coinciden.length === 1 ? coinciden[0].id : "";
}
export function resumenIntencion(accion: string, payload: Record<string, unknown>, datos: OperacionesContextValue): string {
  const nombres: Record<string, Array<{ id: string; nombre: string }>> = { clienteId: datos.clientes, productoId: datos.inventario, proveedorId: datos.proveedores, usuarioId: datos.usuarios, pedidoId: datos.pedidos.map((p) => ({ id: p.id, nombre: p.numero })) };
  const describir = (entrada: Record<string, unknown>): string => Object.entries(entrada).filter(([k, v]) => k !== "password" && k !== "vendedorId" && v !== undefined).map(([k, v]) => {
    if (k === "lineas" && Array.isArray(v)) return v.map((fila) => describir(fila as Record<string, unknown>)).join("; ");
    const nombre = nombres[k]?.find((r) => r.id === v)?.nombre;
    return `${k.replace(/Id$/, "").replace(/([A-Z])/g, " $1").toLowerCase()}: ${nombre ?? (k === "clienteId" && v === null ? "venta ocasional" : Array.isArray(v) ? v.join(", ") : String(v))}`;
  }).join(", ");
  const total = Array.isArray(payload.lineas) ? payload.lineas.reduce((suma, linea: Record<string, unknown>) => suma + Number(linea.cantidad) * (accion === "registrar_compra" ? Number(linea.costoUnitario) : datos.inventario.find((p) => p.id === linea.productoId)?.precioVenta ?? 0), 0) : null;
  return `${ACCIONES_ASISTENTE[accion as AccionAsistente].titulo}. ${describir(payload)}.${total !== null ? ` Total estimado: ${total.toLocaleString("es-CO")} pesos.` : ""}`;
}
export function resolverDatosIntencion(payload: Record<string, unknown>, datos: OperacionesContextValue): Record<string, unknown> {
  const referencias: Record<string, Array<{ id: string; nombre: string }>> = {
    clienteId: datos.clientes, productoId: datos.inventario, proveedorId: datos.proveedores, usuarioId: datos.usuarios,
    pedidoId: datos.pedidos.map((p) => ({ id: p.id, nombre: p.numero })),
    conteoId: datos.conteos.map((c) => ({ id: c.id, nombre: `${c.tipo} · ${c.turno} · ${c.estado}` })),
  };
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined).map(([campo, valor]) => {
    if (campo === "lineas" && Array.isArray(valor)) return [campo, valor.map((linea) => resolverDatosIntencion(linea as Record<string, unknown>, datos))];
    if (referencias[campo]) {
      if (campo === "clienteId" && valor === null) return [campo, null];
      const id = resolverReferencia(valor, referencias[campo]);
      if (!id) throw new Error(`Selecciona un registro válido para ${campo.replace(/Id$/, "")}.`);
      return [campo, id];
    }
    return [campo, valor];
  }));
}
