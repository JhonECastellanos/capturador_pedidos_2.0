import type { OperacionesContextValue } from "../../context/operaciones-context";
import { ACCIONES_ASISTENTE, numeroHablado, type AccionAsistente } from "@ambie/contrato";

const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const pluralesProducto: Record<string, string> = { gaseosas: "gaseosa", jugos: "jugo", naturales: "natural", sandwiches: "sandwich", sanduches: "sandwich", yogures: "yogur", yogurt: "yogur", yogurts: "yogur", yogurtes: "yogur", yoghurt: "yogur", yoghurts: "yogur", chocolatinas: "chocolatina", chocolates: "chocolate", empanadas: "empanada", dulces: "dulce", chocorramos: "chocorramo", botellas: "botella", paquetes: "paquete", galletas: "galleta", personales: "personal" };
export function resolverReferencia(valor: unknown, opciones: Array<{ id: string; nombre: string }>): string {
  if (typeof valor !== "string") return "";
  const exacta = opciones.find((o) => o.id === valor);
  if (exacta) return exacta.id;
  const coinciden = opciones.filter((o) => normalizar(o.nombre) === normalizar(valor));
  return coinciden.length === 1 ? coinciden[0].id : "";
}
function nombreProductoVoz(valor: string) {
  return normalizar(valor).replace(/(\d)[.,](\d)/g, "$1.$2")
    .replace(/\b[a-z]+\b/g, palabra => pluralesProducto[palabra] ?? (palabra.length > 4 && palabra.endsWith("s") && numeroHablado(palabra) === undefined ? palabra.slice(0, -1) : palabra))
    .replace(/\buno punto cinco\b/g, "1.5")
    .replace(/\b([a-z]+(?:\s+y\s+[a-z]+)?)\s+(mililitros?|litros?|gramos?)\b/g, (todo, n: string, unidad: string) => {
      const numero = numeroHablado(n); return numero === undefined ? todo : `${numero} ${unidad}`;
    })
    .replace(/mililitros?/g, "ml").replace(/litros?/g, "l").replace(/gramos?/g, "g")
    .replace(/coca[\s-]*cola/g, "cocacola").replace(/de\s+todito/g, "detodito")
    .replace(/(\d)(ml|l|g)\b/g, "$1 $2").replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
}
export class ProductoVozAmbiguo extends Error {
  readonly opciones: Array<{ id: string; nombre: string }>;
  constructor(opciones: Array<{ id: string; nombre: string }>) {
    const nombres = opciones.map(p => p.nombre.split(" "));
    let comunes = 0;
    while (nombres.length > 1 && nombres[0][comunes] && nombres.every(n => n[comunes] === nombres[0][comunes])) comunes++;
    super(`Hay varias presentaciones. ¿${nombres.slice(0, 3).map(n => n.slice(comunes).join(" ") || n.join(" ")).join(" o ")}${opciones.length > 3 ? ", u otra de la lista" : ""}?`);
    this.opciones = opciones;
  }
}
export class ProductoVozSugerido extends ProductoVozAmbiguo {
  constructor(opciones: Array<{ id: string; nombre: string }>) {
    super(opciones);
    this.message = `No encontré ese nombre exacto. ¿Quieres ${opciones.slice(0, 3).map(p => p.nombre).join(" o ")}?`;
  }
}
function similitudNombre(a: string, b: string): number {
  const pares = (texto: string) => new Set(Array.from({ length: Math.max(0, texto.length - 1) }, (_, i) => texto.slice(i, i + 2)));
  const pa = pares(a), pb = pares(b);
  return pa.size + pb.size ? 2 * [...pa].filter(p => pb.has(p)).length / (pa.size + pb.size) : 0;
}
function diferenciaMinima(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || /\d/.test(a + b) || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, cambios = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++cambios > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return cambios + Number(i < a.length || j < b.length) <= 1;
}
/** Solo nombres/presentaciones inequívocos; jamás escoger arbitrariamente una variante. */
export function resolverProductoVoz(valor: unknown, opciones: Array<{ id: string; nombre: string }>): string {
  if (typeof valor !== "string" || !valor.trim()) throw new Error("Di la cantidad, el producto y su presentación.");
  const exacta = resolverReferencia(valor, opciones);
  if (exacta) return exacta;
  const consulta = nombreProductoVoz(valor);
  const mismas = opciones.filter(p => nombreProductoVoz(p.nombre) === consulta);
  if (mismas.length === 1) return mismas[0].id;
  const tokens = consulta.split(" ").filter(t => !["gaseosa", "de", "el", "la", "los", "las", "del", "al", "quiero", "uno", "una", "un", "por", "favor", "ese", "esa", "elijo", "quiero", "presentacion"].includes(t));
  let candidatas = tokens.length ? opciones.filter(p => {
    const nombre = nombreProductoVoz(p.nombre).split(" ");
    return tokens.every(t => nombre.includes(t));
  }) : [];
  if (!candidatas.length && tokens.length) candidatas = opciones.filter(p => {
    const nombre = nombreProductoVoz(p.nombre).split(" ");
    let aproximaciones = 0;
    return tokens.every(t => nombre.includes(t) || (++aproximaciones <= 1 && nombre.some(n => diferenciaMinima(t, n))));
  });
  if (candidatas.length === 1) return candidatas[0].id;
  if (candidatas.length > 1) throw new ProductoVozAmbiguo(candidatas);
  const parecidas = opciones.map(p => {
    const palabras = nombreProductoVoz(p.nombre).split(" ").filter(t => !["de", "el", "la"].includes(t));
    const porPalabras = tokens.length ? tokens.reduce((s, t) => s + Math.max(0, ...palabras.map(n => /\d/.test(t + n) ? Number(t === n) : similitudNombre(t, n))), 0) / tokens.length : 0;
    const puntaje = Math.max(porPalabras, similitudNombre(tokens.join(""), palabras.join("")));
    return { producto: p, puntaje };
  }).filter(p => p.puntaje >= .64).sort((a, b) => b.puntaje - a.puntaje).slice(0, 3).map(p => p.producto);
  if (parecidas.length) throw new ProductoVozSugerido(parecidas);
  throw new Error(`No encontré el producto ${valor}. Revisa el nombre o selecciónalo en pantalla.`);
}
export function respuestaHablada(texto: string): string {
  if (/^Productos actualizados\./.test(texto)) return "Listo.";
  if (/^Revisa los productos\./.test(texto)) return "¿Terminaste con los productos?";
  if (/^Pedido confirmado\./.test(texto)) return "Pedido confirmado.";
  if (/^Seleccioné a /.test(texto)) return texto.split(". ¿")[0] + ". ¿Correcto?";
  if (/^Hay varias presentaciones\./.test(texto)) return texto.replace(/^Hay varias presentaciones\.\s*/, "");
  return texto.replace(/\s*Di confirmar (?:productos para continuar|operación para guardar)\./g, "").replace(/\s*Di su nombre o selecciónalo en pantalla\./g, "").trim();
}
export function resumenIntencion(accion: string, payload: Record<string, unknown>, datos: OperacionesContextValue): string {
  const total = totalIntencion(accion, payload, datos);
  return `${accion === "crear_pedido" ? "Pedido listo" : ACCIONES_ASISTENTE[accion as AccionAsistente].titulo + ": listo"}.${total !== null ? ` Total: ${total.toLocaleString("es-CO")} pesos.` : typeof payload.monto === "number" ? ` Monto: ${payload.monto.toLocaleString("es-CO")} pesos.` : ""}`;
}
export function totalIntencion(accion: string, payload: Record<string, unknown>, datos: OperacionesContextValue): number | null {
  const total = Array.isArray(payload.lineas) ? payload.lineas.reduce((suma, linea: Record<string, unknown>) => suma + Number(linea.cantidad) * (accion === "registrar_compra" ? Number(linea.costoUnitario) : datos.inventario.find((p) => p.id === linea.productoId)?.precioVenta ?? 0), 0) : null;
  return total;
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
      const id = campo === "productoId" ? resolverProductoVoz(valor, referencias[campo]) : resolverReferencia(valor, referencias[campo]);
      if (!id) throw new Error(`Selecciona un registro válido para ${campo.replace(/Id$/, "")}.`);
      return [campo, id];
    }
    return [campo, valor];
  }));
}
