import { z } from "zod";
import type { RolUsuario } from "./enums";
import { AjusteManualEsquema, CambiarEstadoPedidoEsquema, CambiarPrecioEsquema, CambiarRolUsuarioEsquema, CobroPedidoEsquema, ContarLineaEsquema, CrearCierreEsquema, CrearUsuarioEsquema, IniciarConteoEsquema, NuevaRecepcionEsquema, NuevoAbonoEsquema, NuevoClienteEsquema, NuevoEgresoEsquema, NuevoGastoEsquema, NuevoPedidoEsquema, NuevoProductoEsquema, NuevoProveedorEsquema } from "./esquemas";

const id = z.string().min(1).max(200);
const vacio = z.object({});
const accion = (titulo: string, ruta: string, esquema: z.ZodTypeAny, admin = true, metodo: "POST" | "PATCH" = "POST") => ({ titulo, ruta, esquema, admin, metodo });

export const ACCIONES_ASISTENTE = {
  crear_cliente: accion("Crear cliente", "/clientes", NuevoClienteEsquema, false),
  crear_pedido: accion("Crear pedido", "/pedidos", NuevoPedidoEsquema, false),
  recibir_abono: accion("Recibir abono de crédito", "/clientes/:clienteId/abonos", NuevoAbonoEsquema.extend({ clienteId: id }), false),
  crear_usuario: accion("Crear usuario", "/usuarios", CrearUsuarioEsquema),
  crear_producto: accion("Crear producto", "/productos", NuevoProductoEsquema),
  crear_proveedor: accion("Crear proveedor", "/proveedores", NuevoProveedorEsquema),
  registrar_compra: accion("Registrar compra", "/recepciones-compra", NuevaRecepcionEsquema),
  registrar_gasto: accion("Registrar gasto", "/gastos", NuevoGastoEsquema),
  registrar_egreso: accion("Registrar egreso de caja", "/caja/egresos", NuevoEgresoEsquema),
  cambiar_precio: accion("Cambiar precio", "/productos/:productoId/precio", CambiarPrecioEsquema.extend({ productoId: id })),
  ajustar_inventario: accion("Ajustar inventario", "/inventario/ajustes", AjusteManualEsquema),
  cambiar_estado_pedido: accion("Cambiar estado del pedido", "/pedidos/:pedidoId/estado", CambiarEstadoPedidoEsquema.extend({ pedidoId: id }), true, "PATCH"),
  cobrar_pedido: accion("Cobrar pedido", "/pedidos/:pedidoId/pagos", CobroPedidoEsquema.extend({ pedidoId: id })),
  trasladar_pedido: accion("Trasladar pedido a hoy", "/pedidos/:pedidoId/trasladar", vacio.extend({ pedidoId: id })),
  cambiar_estado_usuario: accion("Activar o desactivar usuario", "/usuarios/:usuarioId/estado", vacio.extend({ usuarioId: id }), true, "PATCH"),
  cambiar_rol_usuario: accion("Cambiar rol del usuario", "/usuarios/:usuarioId/rol", CambiarRolUsuarioEsquema.extend({ usuarioId: id }), true, "PATCH"),
  iniciar_conteo: accion("Iniciar conteo de inventario", "/inventario/conteos", IniciarConteoEsquema),
  contar_producto: accion("Contar producto", "/inventario/conteos/:conteoId/lineas/:productoId", ContarLineaEsquema.extend({ conteoId: id, productoId: id }), true, "PATCH"),
  finalizar_conteo: accion("Finalizar conteo", "/inventario/conteos/:conteoId/finalizar", vacio.extend({ conteoId: id })),
  cancelar_conteo: accion("Cancelar conteo", "/inventario/conteos/:conteoId/cancelar", vacio.extend({ conteoId: id })),
  aplicar_conteo: accion("Aplicar ajuste de conteo", "/inventario/conteos/:conteoId/aplicar-ajuste", vacio.extend({ conteoId: id })),
  registrar_cierre: accion("Registrar cierre del día", "/cierres/:fecha", CrearCierreEsquema),
} as const;

export type AccionAsistente = keyof typeof ACCIONES_ASISTENTE;
export interface CampoAsistente {
  nombre: string;
  tipo: "texto" | "numero" | "booleano" | "seleccion" | "lineas" | "lista";
  requerido: boolean;
  opciones?: string[];
  campos?: CampoAsistente[];
}
export function camposAsistente(esquema: z.ZodTypeAny): CampoAsistente[] {
  if (esquema instanceof z.ZodEffects) return camposAsistente(esquema.innerType());
  if (!(esquema instanceof z.ZodObject)) return [];
  return Object.entries(esquema.shape as Record<string, z.ZodTypeAny>).map(([nombre, original]) => {
    let campo = original;
    while (campo instanceof z.ZodOptional || campo instanceof z.ZodDefault || campo instanceof z.ZodNullable || campo instanceof z.ZodEffects) campo = campo instanceof z.ZodEffects ? campo.innerType() : campo._def.innerType;
    const requerido = !original.isOptional();
    if (campo instanceof z.ZodEnum) return { nombre, tipo: "seleccion", requerido, opciones: campo.options };
    if (campo instanceof z.ZodNumber) return { nombre, tipo: "numero", requerido };
    if (campo instanceof z.ZodBoolean) return { nombre, tipo: "booleano", requerido };
    if (campo instanceof z.ZodArray) return { nombre, tipo: campo.element instanceof z.ZodObject ? "lineas" : "lista", requerido, campos: camposAsistente(campo.element) };
    return { nombre, tipo: "texto", requerido };
  });
}
export function esAccionAsistente(valor: string): valor is AccionAsistente {
  return Object.hasOwn(ACCIONES_ASISTENTE, valor);
}
export function accionesParaRol(rol: RolUsuario): AccionAsistente[] {
  return (Object.keys(ACCIONES_ASISTENTE) as AccionAsistente[]).filter((a) => rol === "administrador" || !ACCIONES_ASISTENTE[a].admin);
}

export const DESTINOS_ASISTENTE = {
  ventas: "/admin/ventas", pedidos: "/admin/pedidos", creditos: "/admin/creditos",
  inventario: "/admin/inventario", compras: "/admin/compras", precios: "/admin/precios",
  caja: "/admin/caja", cierre: "/admin/cierre", usuarios: "/admin/usuarios",
  auditoria: "/admin/auditoria", configuracion: "/admin/configuracion",
  clientes: "/admin/ventas/clientes/nuevo", abonos: "/admin/ventas/abonos", inicio: "/admin",
} as const;
export function rutaAsistente(destino: string, rol: RolUsuario): string | null {
  if (!Object.hasOwn(DESTINOS_ASISTENTE, destino)) return null;
  if (rol === "administrador") return DESTINOS_ASISTENTE[destino as keyof typeof DESTINOS_ASISTENTE];
  return ({ inicio: "/vendedor", ventas: "/vendedor/pedido", pedidos: "/vendedor", clientes: "/vendedor/pedido", creditos: "/vendedor/abonos", abonos: "/vendedor/abonos" } as Record<string, string>)[destino] ?? null;
}

export const ConfiguracionAsistenteEsquema = z.object({
  proveedor: z.enum(["basico", "gemini", "groq", "compatible"]).default("basico"),
  modelo: z.string().trim().max(120).default(""),
  urlBase: z.string().trim().max(500).default(""),
  clave: z.string().trim().max(512).optional(),
  borrarClave: z.boolean().default(false),
  vozHabilitada: z.boolean().default(true),
  confirmacionVoz: z.boolean().default(true),
  responderConVoz: z.boolean().default(true),
}).strict();
export type ConfiguracionAsistenteEntrada = z.input<typeof ConfiguracionAsistenteEsquema>;
export type ConfiguracionAsistentePublica = Omit<z.output<typeof ConfiguracionAsistenteEsquema>, "clave" | "borrarClave"> & { tieneClave: boolean };

const valorJson: z.ZodType<unknown> = z.lazy(() => z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null(), z.array(valorJson).max(60), z.record(valorJson)]));
export const IntencionAsistenteEsquema = z.object({
  accion: z.string().max(80).nullable(),
  payload: z.record(valorJson).default({}),
  destino: z.string().max(80).nullable().default(null),
  mensaje: z.string().min(1).max(600),
}).strict();
export type IntencionAsistente = z.infer<typeof IntencionAsistenteEsquema>;
export const EntenderAsistenteEsquema = z.object({ texto: z.string().trim().min(1).max(2000), pendiente: IntencionAsistenteEsquema.optional(), campo: z.string().max(80).optional(), nombres: z.record(z.string().max(200)).refine(v => Object.keys(v).length <= 60).optional() }).strict();
export type EventoVoz = { tipo: "lista" } | { tipo: "parcial"; texto: string } | { tipo: "final"; texto: string; confianza: number } | { tipo: "error"; mensaje: string };
export function comandoVoz(texto: string, confianza: number): "confirmar" | "cancelar" | null {
  if (confianza < 0.85) return null;
  const normal = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.,!?¿¡]/g, "").trim();
  if (["confirma", "confirmar", "confirmar operacion", "confirmo la operacion"].includes(normal)) return "confirmar";
  if (["cancelar", "cancela", "cancelar operacion", "cancela la operacion"].includes(normal)) return "cancelar";
  return null;
}

export function prepararOperacionAsistente(nombre: string, entrada: unknown, rol: RolUsuario) {
  if (!esAccionAsistente(nombre) || !accionesParaRol(rol).includes(nombre)) throw new Error("No tienes permisos para realizar esta acción");
  const definicion = ACCIONES_ASISTENTE[nombre];
  const cuerpo = definicion.esquema.parse(entrada) as Record<string, unknown>;
  const ruta = definicion.ruta.replace(/:([a-zA-Z]+)/g, (_, campo: string) => {
    const valor = cuerpo[campo];
    if (typeof valor !== "string" || !valor) throw new Error("Falta seleccionar el registro");
    delete cuerpo[campo];
    return encodeURIComponent(valor);
  });
  return { ruta, metodo: definicion.metodo, cuerpo };
}
