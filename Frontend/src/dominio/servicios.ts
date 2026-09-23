import type {
  AbonoCredito,
  AbonoCreditoParcial,
  AjusteInventario,
  CambioPrecio,
  Cliente,
  ConteoInventario,
  EstadoPedido,
  Gasto,
  HistorialEstadoPedido,
  LineaConteo,
  LineaPedido,
  LineaRecepcion,
  MetodoPago,
  MovimientoCaja,
  NuevoCliente,
  NuevoPedido,
  NuevoProducto,
  PagoPedido,
  Pedido,
  Producto,
  Proveedor,
  RecepcionCompra,
  RolUsuario,
  UsuarioSistema,
} from "../types";
import { frecuenciaDeTipoCredito } from "../types";

/**
 * Reglas de negocio puras: reciben los datos actuales y devuelven
 * los nuevos valores, sin efectos secundarios. La capa de contexto
 * (fachada) orquesta y persiste.
 */

export const PERMISOS_POR_ROL: Record<RolUsuario, string[]> = {
  administrador: ["pedidos", "inventario", "caja", "usuarios", "cierre-diario"],
  vendedor: ["clientes", "pedidos", "cobros"],
};

export function permisosDeRol(rol: RolUsuario): string[] {
  return [...PERMISOS_POR_ROL[rol]];
}

// ─── Clientes ─────────────────────────────────────────────────────

/**
 * Construye el cliente desde el alta de 5 campos.
 * Alias, identificación y ciudad se derivan si no vienen,
 * y la frecuencia de recordatorio nace del tipo de crédito pactado.
 */
export function construirCliente(datos: NuevoCliente, id: string, creadoEn: string): Cliente {
  const nombre = datos.nombre.trim();
  return {
    id,
    nombre,
    alias: datos.alias?.trim() || nombre,
    identificacion: datos.identificacion?.trim() || "",
    telefono: datos.telefono.trim(),
    ciudad: datos.ciudad?.trim() || "",
    direccion: datos.direccion.trim(),
    estadoCuenta: "al-dia",
    saldoPendiente: 0,
    creadoEn,
    fechaNacimiento: datos.fechaNacimiento || undefined,
    tipoCredito: datos.tipoCredito,
    frecuenciaCreditoDias: frecuenciaDeTipoCredito(datos.tipoCredito),
  };
}

// ─── Pedidos ──────────────────────────────────────────────────────

export function construirPago(metodo: MetodoPago, total: number): PagoPedido {
  const esCredito = metodo === "credito";
  return {
    metodo,
    montoRecibido: esCredito ? 0 : total,
    saldoPendiente: esCredito ? total : 0,
    estado: esCredito ? "pendiente" : "pagado",
    recordatorioWhatsApp: esCredito,
  };
}

export function construirPedido(entrada: NuevoPedido, id: string, numero: string, creadoEn: string): Pedido {
  const estadoInicial = entrada.estadoInicial ?? "pendiente";
  return {
    id,
    numero,
    clienteId: entrada.clienteId,
    vendedorId: entrada.vendedorId,
    lineas: entrada.lineas,
    subtotal: entrada.total,
    total: entrada.total,
    pago: entrada.pago,
    estado: estadoInicial,
    creadoEn,
    historialEstados: [{ estado: estadoInicial, usuarioId: entrada.vendedorId, fecha: creadoEn }],
  };
}

/** Descuenta el stock vendido (nunca por debajo de cero). */
export function aplicarPedidoEnInventario(inventario: Producto[], lineas: LineaPedido[]): Producto[] {
  return inventario.map((producto) => {
    const linea = lineas.find((item) => item.productoId === producto.id);
    return linea ? { ...producto, stock: Math.max(0, producto.stock - linea.cantidad) } : producto;
  });
}

/** Actualiza cartera del cliente cuando el pago queda a crédito. */
export function aplicarPedidoEnClientes(clientes: Cliente[], pedido: Pedido): Cliente[] {
  if (pedido.pago.saldoPendiente <= 0) return clientes;
  return clientes.map((cliente) =>
    cliente.id === pedido.clienteId
      ? { ...cliente, estadoCuenta: "pendiente", saldoPendiente: cliente.saldoPendiente + pedido.pago.saldoPendiente }
      : cliente,
  );
}

/** Movimiento de caja por el dinero recibido en el pedido. */
export function ingresoCajaDePedido(pedido: Pedido, id: string): MovimientoCaja {
  return {
    id,
    tipo: "ingreso",
    concepto: `Pago ${pedido.numero}`,
    monto: pedido.pago.montoRecibido,
    metodo: pedido.pago.metodo,
    usuarioId: pedido.vendedorId,
    referenciaId: pedido.id,
    creadoEn: pedido.creadoEn,
  };
}

export function registrarCambioEstado(pedido: Pedido, estado: EstadoPedido, usuarioId: string, fecha: string): Pedido {
  if (pedido.estado === estado) return pedido;
  const entrada: HistorialEstadoPedido = { estado, usuarioId, fecha };
  return { ...pedido, estado, historialEstados: [...pedido.historialEstados, entrada] };
}

/**
 * Aplica un pago directo al saldo de un pedido concreto.
 * Se usa en el cobro al entregar, donde el dinero recibido es de ese pedido
 * y no debe repartirse entre otras deudas del cliente.
 */
export function aplicarPagoDirectoEnPedido(pedido: Pedido, monto: number): Pedido {
  const aplicado = Math.min(Math.max(0, monto), pedido.pago.saldoPendiente);
  if (aplicado <= 0) return pedido;
  const nuevoSaldo = pedido.pago.saldoPendiente - aplicado;
  return {
    ...pedido,
    pago: {
      ...pedido.pago,
      saldoPendiente: nuevoSaldo,
      montoRecibido: pedido.pago.montoRecibido + aplicado,
      estado: nuevoSaldo === 0 ? "pagado" : "pendiente",
      recordatorioWhatsApp: nuevoSaldo > 0,
    },
  };
}

/** Mueve un pedido pendiente a la fecha de hoy (no se contabiliza ayer). */
export function trasladarPedidoAHoy(pedido: Pedido, nuevaFecha: string): Pedido {
  return { ...pedido, creadoEn: nuevaFecha };
}

// ─── Créditos y abonos ────────────────────────────────────────────

/** Reparte un abono entre los pedidos pendientes del cliente (más antiguos primero). */
export function distribuirAbonoEnPedidos(
  pedidosPendientes: Pedido[],
  monto: number,
): { actualizados: Map<string, { saldoPendiente: number; montoRecibido: number; estado: PagoPedido["estado"] }>; parciales: AbonoCreditoParcial[]; sobrante: number } {
  const ordenados = [...pedidosPendientes].sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime());
  let restante = monto;
  const actualizados = new Map<string, { saldoPendiente: number; montoRecibido: number; estado: PagoPedido["estado"] }>();
  const parciales: AbonoCreditoParcial[] = [];
  for (const pedido of ordenados) {
    if (restante <= 0) break;
    const pendiente = pedido.pago.saldoPendiente;
    if (pendiente <= 0) continue;
    const aplicado = Math.min(pendiente, restante);
    restante -= aplicado;
    const nuevoSaldo = pendiente - aplicado;
    actualizados.set(pedido.id, {
      saldoPendiente: nuevoSaldo,
      montoRecibido: pedido.pago.montoRecibido + aplicado,
      estado: nuevoSaldo === 0 ? "pagado" : "pendiente",
    });
    parciales.push({ pedidoId: pedido.id, numero: pedido.numero, montoAplicado: aplicado });
  }
  return { actualizados, parciales, sobrante: restante };
}

export function aplicarAbonoEnPedidos(pedidos: Pedido[], actualizados: Map<string, { saldoPendiente: number; montoRecibido: number; estado: PagoPedido["estado"] }>): Pedido[] {
  return pedidos.map((pedido) => {
    const cambio = actualizados.get(pedido.id);
    if (!cambio) return pedido;
    return {
      ...pedido,
      pago: { ...pedido.pago, saldoPendiente: cambio.saldoPendiente, montoRecibido: cambio.montoRecibido, estado: cambio.estado, recordatorioWhatsApp: cambio.saldoPendiente > 0 },
    };
  });
}

export function aplicarAbonoEnClientes(clientes: Cliente[], clienteId: string, montoAplicado: number, fecha: string): Cliente[] {
  return clientes.map((cliente) => {
    if (cliente.id !== clienteId) return cliente;
    const nuevoSaldo = Math.max(0, cliente.saldoPendiente - montoAplicado);
    return {
      ...cliente,
      saldoPendiente: nuevoSaldo,
      estadoCuenta: nuevoSaldo > 0 ? "pendiente" : "al-dia",
      ultimoAbonoCreditoEn: fecha,
    };
  });
}

export function construirAbono(
  clienteId: string,
  monto: number,
  metodo: AbonoCredito["metodo"],
  usuarioId: string,
  parciales: AbonoCreditoParcial[],
  comentario: string | undefined,
  id: string,
  creadoEn: string,
): AbonoCredito {
  return { id, clienteId, monto, metodo, usuarioId, pedidosAfectados: parciales, comentario: comentario?.trim() || undefined, creadoEn };
}

export function ingresoCajaDeAbono(abono: AbonoCredito, clienteNombre: string, id: string): MovimientoCaja {
  return {
    id,
    tipo: "ingreso",
    concepto: `Abono crédito ${clienteNombre}`,
    monto: abono.monto,
    metodo: abono.metodo,
    usuarioId: abono.usuarioId,
    referenciaId: abono.id,
    creadoEn: abono.creadoEn,
  };
}

export function diasEntre(fechaIso: string, referencia: Date): number {
  const fecha = new Date(fechaIso);
  const copiaRef = new Date(referencia);
  fecha.setHours(0, 0, 0, 0);
  copiaRef.setHours(0, 0, 0, 0);
  return Math.floor((copiaRef.getTime() - fecha.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Productos ────────────────────────────────────────────────────

export function construirProducto(datos: NuevoProducto, id: string, codigoInterno: string, colorEtiqueta: string): Producto {
  return { id, codigoInterno, ...datos, colorEtiqueta, activo: true };
}

// ─── Usuarios ─────────────────────────────────────────────────────

export function construirUsuario(nombre: string, email: string, rol: RolUsuario, id: string, password?: string): UsuarioSistema {
  return { id, nombre, email, password, rol, permisos: permisosDeRol(rol), activo: true };
}

export function construirAjusteManual(
  productoId: string,
  nombre: string,
  stockTeorico: number,
  stockFisico: number,
  motivo: string,
  comentario: string | undefined,
  usuarioId: string,
  id: string,
  creadoEn: string,
): AjusteInventario {
  const diferencia = stockFisico - stockTeorico;
  const linea: LineaConteo = { productoId, nombre, stockTeorico, stockFisico, diferencia };
  return { id, conteoId: "manual", usuarioId, lineas: [linea], motivo, comentario, creadoEn };
}

// ─── Proveedores y compras ────────────────────────────────────────

export function construirProveedor(nombre: string, telefono: string | undefined, id: string, creadoEn: string): Proveedor {
  return { id, nombre: nombre.trim(), telefono: telefono?.trim() || undefined, creadoEn };
}

export function construirRecepcion(
  proveedorId: string,
  usuarioId: string,
  lineas: LineaRecepcion[],
  descontarCaja: boolean,
  id: string,
  numero: string,
  creadoEn: string,
): RecepcionCompra {
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);
  return { id, numero, proveedorId, usuarioId, lineas, total, descontarCaja, creadoEn };
}

export function aplicarRecepcionEnInventario(inventario: Producto[], lineas: LineaRecepcion[]): Producto[] {
  return inventario.map((producto) => {
    const linea = lineas.find((item) => item.productoId === producto.id);
    if (!linea) return producto;
    return {
      ...producto,
      stock: producto.stock + linea.cantidad,
      costoActual: linea.costoUnitario,
    };
  });
}

export function construirLineaRecepcion(
  producto: Producto,
  cantidad: number,
  costoUnitario: number,
): LineaRecepcion {
  return {
    productoId: producto.id,
    nombre: producto.nombre,
    codigoInterno: producto.codigoInterno,
    cantidad,
    costoUnitario,
    subtotal: cantidad * costoUnitario,
  };
}

export function egresoCajaDeRecepcion(recepcion: RecepcionCompra, id: string): MovimientoCaja {
  return {
    id,
    tipo: "egreso",
    concepto: `Compra ${recepcion.numero}`,
    monto: recepcion.total,
    usuarioId: recepcion.usuarioId,
    referenciaId: recepcion.id,
    creadoEn: recepcion.creadoEn,
  };
}

export function construirGasto(concepto: string, monto: number, usuarioId: string, id: string, creadoEn: string): Gasto {
  return { id, concepto: concepto.trim(), monto, usuarioId, creadoEn };
}

export function egresoCajaDeGasto(gasto: Gasto, id: string): MovimientoCaja {
  return {
    id,
    tipo: "egreso",
    concepto: gasto.concepto,
    monto: gasto.monto,
    usuarioId: gasto.usuarioId,
    referenciaId: gasto.id,
    creadoEn: gasto.creadoEn,
  };
}

// ─── Conteos y ajustes ────────────────────────────────────────────

export function construirConteo(
  tipo: ConteoInventario["tipo"],
  productos: Producto[],
  cantidadAleatoria: number | null,
  usuarioId: string,
  turno: string,
  id: string,
  iniciadoEn: string,
): ConteoInventario {
  let lista = productos;
  if (tipo === "aleatorio" && cantidadAleatoria) {
    const mezclados = [...productos].sort(() => Math.random() - 0.5);
    lista = mezclados.slice(0, Math.min(cantidadAleatoria, productos.length));
  }
  // Al abrir el conteo las líneas quedan sin contar: el físico solo existe
  // cuando alguien lo digita, así un conteo a medias nunca pisa el stock.
  const lineas: LineaConteo[] = lista.map((producto) => ({
    productoId: producto.id,
    nombre: producto.nombre,
    stockTeorico: producto.stock,
    stockFisico: 0,
    diferencia: 0,
  }));
  return { id, tipo, usuarioId, turno, iniciadoEn, lineas, lineasContadas: [], estado: "en-curso" };
}

export function actualizarLineaConteo(
  conteo: ConteoInventario,
  productoId: string,
  stockFisico: number,
): ConteoInventario {
  const lineas = conteo.lineas.map((linea) =>
    linea.productoId === productoId ? { ...linea, stockFisico, diferencia: stockFisico - linea.stockTeorico } : linea,
  );
  const contadas = conteo.lineasContadas ?? [];
  return { ...conteo, lineas, lineasContadas: contadas.includes(productoId) ? contadas : [...contadas, productoId] };
}

/** Líneas del conteo con físico registrado (los conteos viejos se toman completos). */
export function lineasContadasDe(conteo: ConteoInventario): LineaConteo[] {
  if (!conteo.lineasContadas) return conteo.lineas;
  return conteo.lineas.filter((linea) => conteo.lineasContadas?.includes(linea.productoId));
}

/** Totales de un conteo para el historial: contadas, sobrantes y faltantes. */
export function resumenConteo(conteo: ConteoInventario): { contadas: number; sobrantes: number; faltantes: number; totalDiferencia: number } {
  const lineas = lineasContadasDe(conteo);
  const sobrantes = lineas.filter((linea) => linea.diferencia > 0).length;
  const faltantes = lineas.filter((linea) => linea.diferencia < 0).length;
  const totalDiferencia = lineas.reduce((suma, linea) => suma + linea.diferencia, 0);
  return { contadas: lineas.length, sobrantes, faltantes, totalDiferencia };
}

export function finalizarConteo(conteo: ConteoInventario, finalizadoEn: string): ConteoInventario {
  return { ...conteo, finalizadoEn, estado: "confirmado" };
}

export function cancelarConteo(conteo: ConteoInventario): ConteoInventario {
  return { ...conteo, estado: "cancelado" };
}

export function construirAjuste(conteo: ConteoInventario, usuarioId: string, id: string, creadoEn: string): AjusteInventario {
  return { id, conteoId: conteo.id, usuarioId, lineas: lineasContadasDe(conteo), creadoEn };
}

export function aplicarAjusteEnInventario(inventario: Producto[], ajuste: AjusteInventario): Producto[] {
  return inventario.map((producto) => {
    const linea = ajuste.lineas.find((item) => item.productoId === producto.id);
    return linea ? { ...producto, stock: linea.stockFisico } : producto;
  });
}

// ─── Precios ──────────────────────────────────────────────────────

export function construirCambioPrecio(
  productoId: string,
  valorAnterior: number,
  valorNuevo: number,
  usuarioId: string,
  id: string,
  fecha: string,
): CambioPrecio {
  return { id, productoId, valorAnterior, valorNuevo, usuarioId, fecha };
}

export function aplicarCambioPrecioEnInventario(inventario: Producto[], productoId: string, valorNuevo: number): Producto[] {
  return inventario.map((producto) => (producto.id === productoId ? { ...producto, precioVenta: valorNuevo } : producto));
}

export function calcularMargen(precioVenta: number, costoActual: number): { absoluto: number; porcentaje: number } {
  const absoluto = precioVenta - costoActual;
  const porcentaje = costoActual > 0 ? (absoluto / costoActual) * 100 : 0;
  return { absoluto, porcentaje };
}
