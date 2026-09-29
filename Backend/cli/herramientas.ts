import { z } from "zod";
import { DeclaracionHerramienta } from "./proveedores/tipos";
import { ClienteAPI } from "./cliente-api";
import { ErrorDominio } from "./errores";

/**
 * Herramientas que el modelo puede invocar contra la API.
 *
 * Cada herramienta es un contrato: nombre, esquema y una acción. La IA decide
 * cuál llamar; el código decide cómo. Así el modelo nunca inventa datos de la
 * base: o pregunta a la API, o lo dice.
 */

export interface Herramienta {
  declaracion: DeclaracionHerramienta;
  /** Valida los argumentos antes de tocar la red. */
  esquema: z.ZodType<any>;
  ejecutar(cliente: ClienteAPI, args: any): Promise<unknown>;
}

const texto = (descripcion: string) => ({ type: "string", description: descripcion });
const numero = (descripcion: string) => ({ type: "number", description: descripcion });

export const HERRAMIENTAS: Herramienta[] = [
  {
    declaracion: {
      nombre: "buscar_clientes",
      descripcion:
        "Busca clientes por nombre, alias, teléfono o código. Úsala antes de crear un cliente para no duplicar, y antes de registrar un pedido para obtener su id.",
      parametros: {
        type: "object",
        properties: {
          busqueda: texto("Texto a buscar: nombre, alias, teléfono o código. Déjalo vacío para listar todos."),
          limite: numero("Máximo de resultados a devolver (por defecto 20)."),
        },
      },
    },
    esquema: z.object({ busqueda: z.string().optional(), limite: z.number().int().min(1).max(100).optional() }),
    async ejecutar(cliente, args) {
      const { items, meta } = await cliente.pedirPagina<any>(
        `/api/v1/clientes?busqueda=${encodeURIComponent(args.busqueda ?? "")}&pageSize=${args.limite ?? 20}`,
      );
      return {
        total: meta.total ?? items.length,
        clientes: items.map((c) => ({
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          alias: c.alias,
          telefono: c.telefono,
          ciudad: c.ciudad,
          saldo: c.saldo ?? null,
        })),
      };
    },
  },

  {
    declaracion: {
      nombre: "crear_cliente",
      descripcion: "Crea un cliente nuevo. Solo cuando `buscar_clientes` no devuelva uno equivalente.",
      parametros: {
        type: "object",
        properties: {
          nombre: texto("Nombre completo o razón social."),
          alias: texto("Apodo con el que lo conocen en la tienda."),
          telefono: texto("Teléfono de contacto."),
          ciudad: texto("Ciudad."),
          direccion: texto("Dirección de entrega."),
          tipoCreditoId: texto("Id de un tipo de crédito, si lo sabías. Opcional."),
        },
        required: ["nombre", "alias", "telefono", "ciudad", "direccion"],
      },
    },
    esquema: z.object({
      nombre: z.string().min(1),
      alias: z.string().min(1),
      telefono: z.string().min(1),
      ciudad: z.string().min(1),
      direccion: z.string().min(1),
      tipoCreditoId: z.string().optional(),
    }),
    async ejecutar(cliente, args) {
      const creado = await cliente.pedir<any>("POST", "/api/v1/clientes", args);
      return { creado: true, cliente: { id: creado.id, codigo: creado.codigo, nombre: creado.nombre } };
    },
  },

  {
    declaracion: {
      nombre: "consultar_cartera",
      descripcion: "Muestra lo que un cliente debe: saldo, pedidos pendientes y abonos aplicados.",
      parametros: {
        type: "object",
        properties: { clienteId: texto("Id del cliente, no su nombre.") },
        required: ["clienteId"],
      },
    },
    esquema: z.object({ clienteId: z.string().min(1) }),
    async ejecutar(cliente, args) {
      return cliente.pedir("GET", `/api/v1/clientes/${args.clienteId}/cartera`);
    },
  },

  {
    declaracion: {
      nombre: "buscar_productos",
      descripcion: "Busca productos por nombre o código. Devuelve precio, stock y stock reservado.",
      parametros: {
        type: "object",
        properties: {
          busqueda: texto("Texto a buscar. Déjalo vacío para listar."),
          soloConStock: { type: "boolean", description: "Si es cierto, solo productos con existencias." },
          limite: numero("Máximo de resultados (por defecto 20)."),
        },
      },
    },
    esquema: z.object({
      busqueda: z.string().optional(),
      soloConStock: z.boolean().optional(),
      limite: z.number().int().min(1).max(100).optional(),
    }),
    async ejecutar(cliente, args) {
      const partes = [`busqueda=${encodeURIComponent(args.busqueda ?? "")}`, `pageSize=${args.limite ?? 20}`];
      if (args.soloConStock) partes.push("stockEstado=disponible");
      const { items, meta } = await cliente.pedirPagina<any>(`/api/v1/productos?${partes.join("&")}`);
      return {
        total: meta.total ?? items.length,
        productos: items.map((p) => ({
          id: p.id,
          codigoInterno: p.codigoInterno,
          nombre: p.nombre,
          precioVenta: p.precioVenta,
          stock: p.stock,
          unidad: p.unidad,
        })),
      };
    },
  },

  {
    declaracion: {
      nombre: "registrar_pedido",
      descripcion:
        "Registra un pedido para un cliente. Cada línea necesita el id del producto, la cantidad y el precio unitario. Baja el stock del producto. Úsala solo cuando el cliente esté confirmado.",
      parametros: {
        type: "object",
        properties: {
          clienteId: texto("Id del cliente."),
          metodo: {
            type: "string",
            enum: ["efectivo", "billetera", "credito"],
            description: "Cómo paga. 'credito' genera cartera por cobrar.",
          },
          momentoCobro: {
            type: "string",
            enum: ["AL_ENTREGAR", "ANTICIPADO"],
            description: "Cuándo se cobra. Solo tiene sentido con crédito.",
          },
          lineas: {
            type: "array",
            description: "Productos del pedido.",
            items: {
              type: "object",
              properties: {
                productoId: texto("Id del producto."),
                cantidad: numero("Unidades."),
                precioUnitario: numero("Precio de venta por unidad."),
              },
              required: ["productoId", "cantidad", "precioUnitario"],
            },
          },
        },
        required: ["clienteId", "metodo", "lineas"],
      },
    },
    esquema: z.object({
      clienteId: z.string().min(1),
      metodo: z.enum(["efectivo", "billetera", "credito"]),
      momentoCobro: z.enum(["AL_ENTREGAR", "ANTICIPADO"]).optional(),
      lineas: z
        .array(
          z.object({
            productoId: z.string().min(1),
            cantidad: z.number().int().min(1),
            precioUnitario: z.number().min(0),
          }),
        )
        .min(1),
    }),
    async ejecutar(cliente, args) {
      const pedido = await cliente.pedir<any>("POST", "/api/v1/pedidos", args);
      return {
        registrado: true,
        pedido: { id: pedido.id, numero: pedido.numero, total: pedido.total, estado: pedido.estado },
      };
    },
  },

  {
    declaracion: {
      nombre: "registrar_abono",
      descripcion:
        "Registra un pago de un cliente. El saldo se descuenta de sus pedidos más antiguos. No puede superar lo que el cliente debe.",
      parametros: {
        type: "object",
        properties: {
          clienteId: texto("Id del cliente."),
          monto: numero("Valor del abono, en pesos."),
          metodo: { type: "string", enum: ["efectivo", "billetera"], description: "Con qué pagan." },
          comentario: texto("Nota opcional, por ejemplo 'abono semanal'."),
        },
        required: ["clienteId", "monto", "metodo"],
      },
    },
    esquema: z.object({
      clienteId: z.string().min(1),
      monto: z.number().positive(),
      metodo: z.enum(["efectivo", "billetera"]),
      comentario: z.string().optional(),
    }),
    async ejecutar(cliente, args) {
      const abono = await cliente.pedir<any>("POST", `/api/v1/pagos/clientes/${args.clienteId}/abonos`, args);
      return { registrado: true, abono: { id: abono.id, monto: abono.monto, saldoRestante: abono.saldoRestante } };
    },
  },

  {
    declaracion: {
      nombre: "ver_pedidos",
      descripcion: "Lista pedidos, opcionalmente filtrados por cliente, estado o rango de fechas.",
      parametros: {
        type: "object",
        properties: {
          clienteId: texto("Filtra por cliente."),
          estado: texto("Filtra por estado: PENDIENTE, PAGADO, ENTREGADO o CANCELADO."),
          desde: texto("Fecha inicial en formato aaaa-mm-dd."),
          hasta: texto("Fecha final en formato aaaa-mm-dd."),
          limite: numero("Máximo de resultados (por defecto 20)."),
        },
      },
    },
    esquema: z.object({
      clienteId: z.string().optional(),
      estado: z.string().optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      limite: z.number().int().min(1).max(100).optional(),
    }),
    async ejecutar(cliente, args) {
      const q = new URLSearchParams();
      if (args.clienteId) q.set("clienteId", args.clienteId);
      if (args.estado) q.set("estado", args.estado);
      if (args.desde) q.set("desde", args.desde);
      if (args.hasta) q.set("hasta", args.hasta);
      q.set("pageSize", String(args.limite ?? 20));

      const { items, meta } = await cliente.pedirPagina<any>(`/api/v1/pedidos?${q.toString()}`);
      return {
        total: meta.total ?? items.length,
        pedidos: items.map((p) => ({
          id: p.id,
          numero: p.numero,
          cliente: p.cliente?.nombre,
          total: p.total,
          metodo: p.metodo,
          estado: p.estado,
          fechaOperacion: p.fechaOperacion,
        })),
      };
    },
  },

  {
    declaracion: {
      nombre: "resumen_negocio",
      descripcion:
        "Tablero con ventas, pedidos, gastos, utilidad, crédito pendiente, serie diaria y los productos y clientes que más venden, para un rango de fechas.",
      parametros: {
        type: "object",
        properties: {
          desde: texto("Fecha inicial en formato aaaa-mm-dd."),
          hasta: texto("Fecha final en formato aaaa-mm-dd."),
          dias: numero("Días hacia atrás si no das rango (por defecto 30)."),
        },
      },
    },
    esquema: z.object({
      desde: z.string().optional(),
      hasta: z.string().optional(),
      dias: z.number().int().min(1).max(365).optional(),
    }),
    async ejecutar(cliente, args) {
      const q = new URLSearchParams();
      if (args.desde) q.set("desde", args.desde);
      if (args.hasta) q.set("hasta", args.hasta);
      if (args.dias) q.set("dias", String(args.dias));
      return cliente.pedir(`GET`, `/api/v1/dashboard/resumen?${q.toString()}`);
    },
  },

  {
    declaracion: {
      nombre: "consultar_gastos",
      descripcion: "Lista los gastos registrados, con filtro por rango de fechas.",
      parametros: {
        type: "object",
        properties: {
          desde: texto("Fecha inicial en formato aaaa-mm-dd."),
          hasta: texto("Fecha final en formato aaaa-mm-dd."),
        },
      },
    },
    esquema: z.object({ desde: z.string().optional(), hasta: z.string().optional() }),
    async ejecutar(cliente, args) {
      const q = new URLSearchParams();
      if (args.desde) q.set("desde", args.desde);
      if (args.hasta) q.set("hasta", args.hasta);
      const { items } = await cliente.pedirPagina<any>(`/api/v1/gastos?${q.toString()}`);
      return {
        cantidad: items.length,
        gastos: items.map((g) => ({ id: g.id, concepto: g.concepto, monto: g.monto, fecha: g.fechaOperacion })),
      };
    },
  },
];

export function buscarHerramienta(nombre: string): Herramienta | undefined {
  return HERRAMIENTAS.find((h) => h.declaracion.nombre === nombre);
}

/**
 * Ejecuta una herramienta validando sus argumentos.
 * Los errores de validación se devuelven como texto para que la IA lo lea y
 * corrija, en vez de romper la conversación.
 */
export async function ejecutarHerramienta(
  cliente: ClienteAPI,
  nombre: string,
  argumentos: Record<string, unknown>,
): Promise<{ ok: boolean; resultado: unknown }> {
  const herramienta = buscarHerramienta(nombre);
  if (!herramienta) {
    return { ok: false, resultado: { error: `No existe la herramienta "${nombre}".` } };
  }

  const validado = herramienta.esquema.safeParse(argumentos);
  if (!validado.success) {
    const detalles = validado.error.issues
      .map((i) => `${i.path.join(".") || "argumento"}: ${i.message}`)
      .join("; ");
    return { ok: false, resultado: { error: `Argumentos inválidos para ${nombre}: ${detalles}` } };
  }

  try {
    return { ok: true, resultado: await herramienta.ejecutar(cliente, validado.data) };
  } catch (error) {
    // Los errores de dominio son mensajes pensados para el usuario final,
    // así que se leen bien y la IA puede reintentar con otros datos.
    return {
      ok: false,
      resultado: { error: error instanceof ErrorDominio || error instanceof Error ? error.message : String(error) },
    };
  }
}
