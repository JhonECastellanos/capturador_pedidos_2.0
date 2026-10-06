import { ACCIONES_ASISTENTE, camposAsistente, prepararOperacionAsistente, type IntencionAsistente, type RolUsuario } from "@ambie/contrato";
import type { OperacionesContextValue } from "../../context/operaciones-context";
import { resolverDatosIntencion } from "./intencion";

const preguntas: Record<string, string> = {
  clienteId: "¿Qué cliente? Di su nombre o selecciónalo en pantalla.",
  lineas: "¿Qué productos necesita?",
  estadoInicial: "¿Hay algo que preparar en este pedido? Responde sí o no.",
  metodo: "¿Cuál es el método de pago? Efectivo, billetera o crédito para clientes registrados.",
  proveedorId: "¿A qué proveedor corresponde la compra?", productoId: "¿Qué producto?", pedidoId: "¿Qué número de pedido?", usuarioId: "¿Qué usuario?", conteoId: "¿Qué conteo de inventario?",
  nombre: "¿Cuál es el nombre?", telefono: "¿Cuál es el teléfono?", direccion: "¿Cuál es la dirección?", email: "¿Cuál es el correo?", password: "Escribe la contraseña en el formulario. No la dictes.",
  monto: "¿Cuál es el monto?", precioVenta: "¿Cuál es el precio de venta?", nuevoPrecio: "¿Cuál es el nuevo precio?", costoActual: "¿Cuál es el costo?", concepto: "¿Cuál es el concepto?", fecha: "¿Qué fecha? Escríbela en el formulario.", conteoEfectivo: "¿Cuánto efectivo contaste?", conteoBilletera: "¿Cuánto hay en billetera?", descontarCaja: "¿Se descuenta esta compra de la caja? Responde sí o no.",
};
export function camposConversacion(accion: keyof typeof ACCIONES_ASISTENTE): string[] {
  if (accion === "crear_pedido") return ["tipoCliente", "clienteId", "lineas", "estadoInicial", "metodo"];
  if (accion === "cambiar_precio") return ["productoId", "nuevoPrecio"];
  if (accion === "recibir_abono") return ["clienteId", "monto", "metodo"];
  return camposAsistente(ACCIONES_ASISTENTE[accion].esquema).filter((c) => c.requerido || c.nombre === "descontarCaja" || (accion === "registrar_cierre" && /^conteo/.test(c.nombre)) || (accion === "registrar_egreso" && c.nombre === "metodo")).map((c) => c.nombre);
}
export function pasoConversacion(orden: IntencionAsistente, rol: RolUsuario, datos: OperacionesContextValue): { campo: string; pregunta: string } | null {
  if (!orden.accion || !(orden.accion in ACCIONES_ASISTENTE)) return null;
  const accion = orden.accion as keyof typeof ACCIONES_ASISTENTE;
  if (accion === "crear_pedido" && !Object.hasOwn(orden.payload, "clienteId")) return { campo: "tipoCliente", pregunta: "¿Es para un cliente habitual o un cliente ocasional?" };
  const ordenCampos = camposConversacion(accion).filter((c) => c !== "tipoCliente");
  if (accion === "iniciar_conteo" && orden.payload.tipo === "aleatorio" && !ordenCampos.includes("cantidadAleatoria")) ordenCampos.push("cantidadAleatoria");
  for (const campo of ordenCampos) {
    if (campo === "clienteId" && orden.payload.clienteId === null) continue;
    const valor = orden.payload[campo];
    if (valor === undefined || valor === "" || (Array.isArray(valor) && !valor.length)) {
      if (campo === "metodo" && accion === "crear_pedido" && orden.payload.clienteId === null) return { campo, pregunta: "¿Cuál es el método de pago? Para esta venta ocasional solo efectivo o billetera; no admite crédito." };
      return { campo, pregunta: preguntas[campo] ?? `Indica ${campo.replace(/([A-Z])/g, " $1").toLowerCase()}.` };
    }
  }
  try { prepararOperacionAsistente(accion, resolverDatosIntencion(orden.payload, datos), rol); }
  catch (e) {
    if (e && typeof e === "object" && "issues" in e) {
      const issue = (e as { issues: Array<{ path: (string | number)[]; message: string }> }).issues[0];
      if (issue) return { campo: issue.path.join("."), pregunta: `${issue.path[0] === "lineas" ? `Producto ${Number(issue.path[1]) + 1}: ` : ""}${preguntas[String(issue.path.at(-1))] ?? `Indica ${issue.path.at(-1)}.`} ${issue.message}` };
    }
    return { campo: "", pregunta: e instanceof Error ? `Revisa el formulario: ${e.message}` : "Revisa los datos en el formulario." };
  }
  return null;
}
