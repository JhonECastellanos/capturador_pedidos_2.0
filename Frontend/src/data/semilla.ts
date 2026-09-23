import type { Cliente, MovimientoCaja, Pedido, Producto, UsuarioSistema } from "../types";

/**
 * Datos de demostración con los que se siembra localStorage en el
 * primer arranque. A partir de ahí, la fuente de verdad es el
 * almacenamiento local.
 */

export const categorias = ["Bebidas", "Lácteos", "Aseo", "Snacks", "Abarrotes"] as const;

const coloresAmbie = ["#e88f2a", "#3c6b3a", "#7d5a38", "#d97b96", "#304d25", "#b5442e"] as const;

function fechaRelativa(diasAtras: number, horas: number, minutos: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - diasAtras);
  fecha.setHours(horas, minutos, 0, 0);
  return fecha.toISOString();
}

export function semillaClientes(): Cliente[] {
  return [
    { id: "c1", nombre: "Distribuidora El Progreso", alias: "Doña Mary", identificacion: "DEMO-001", telefono: "3001110001", ciudad: "Bogotá", direccion: "Calle 45 #12-30", estadoCuenta: "al-dia", saldoPendiente: 0, creadoEn: fechaRelativa(30, 9, 0) },
    { id: "c2", nombre: "Tienda La Esquina", alias: "El Gordo de la 45", identificacion: "DEMO-002", telefono: "3001110002", ciudad: "Bogotá", direccion: "Carrera 15 #45-09", estadoCuenta: "al-dia", saldoPendiente: 0, creadoEn: fechaRelativa(25, 10, 30) },
    { id: "c3", nombre: "Restaurante Sabor Casita", alias: "Chepito", identificacion: "DEMO-003", telefono: "3001110003", ciudad: "Bogotá", direccion: "Calle 80 #23-14", estadoCuenta: "pendiente", saldoPendiente: 49000, creadoEn: fechaRelativa(20, 14, 15) },
    { id: "c4", nombre: "Panadería Don Pan", alias: "Don Pan", identificacion: "DEMO-004", telefono: "3001110004", ciudad: "Bogotá", direccion: "Av. 68 #40-11", estadoCuenta: "al-dia", saldoPendiente: 0, creadoEn: fechaRelativa(18, 8, 45) },
    { id: "c5", nombre: "Minimarket La 24", alias: "La flaca de la 24", identificacion: "DEMO-005", telefono: "3001110005", ciudad: "Bogotá", direccion: "Calle 24 #7-66", estadoCuenta: "al-dia", saldoPendiente: 0, creadoEn: fechaRelativa(10, 16, 20) },
    { id: "c6", nombre: "Cafetería Aroma", alias: "Martha", identificacion: "DEMO-006", telefono: "3001110006", ciudad: "Bogotá", direccion: "Calle 100 #19-03", estadoCuenta: "al-dia", saldoPendiente: 0, creadoEn: fechaRelativa(5, 11, 10) },
  ];
}

export function semillaProductos(): Producto[] {
  const base: Array<[string, string, number, string, number]> = [
    ["Gaseosa Cola 1.5L", "Bebidas", 5200, "unidad", 120],
    ["Agua Sin Gas 600ml x12", "Bebidas", 18900, "paca", 40],
    ["Jugo de Naranja 1L", "Bebidas", 6100, "unidad", 65],
    ["Cerveza Lager x6", "Bebidas", 21400, "six pack", 30],
    ["Leche Entera 1L", "Lácteos", 4300, "unidad", 90],
    ["Yogurt Fresa 200g x4", "Lácteos", 9800, "pack", 55],
    ["Queso Campesino 500g", "Lácteos", 12600, "unidad", 22],
    ["Detergente en Polvo 3kg", "Aseo", 24500, "bolsa", 18],
    ["Jabón de Baño x3", "Aseo", 7200, "pack", 48],
    ["Limpiador Multiusos 1L", "Aseo", 8600, "unidad", 33],
    ["Papel Higiénico x12", "Aseo", 19900, "paca", 26],
    ["Papas Fritas 150g", "Snacks", 4700, "unidad", 70],
    ["Galletas Surtidas x6", "Snacks", 11200, "pack", 44],
    ["Maní Salado 200g", "Snacks", 5600, "unidad", 38],
    ["Arroz Premium 1kg", "Abarrotes", 4900, "unidad", 150],
    ["Aceite Vegetal 1L", "Abarrotes", 10300, "unidad", 60],
    ["Pasta Larga 500g", "Abarrotes", 3600, "unidad", 95],
    ["Café Molido 500g", "Abarrotes", 15800, "unidad", 27],
  ];
  return base.map(([nombre, categoria, precioVenta, unidad, stock], indice) => ({
    id: `p${indice + 1}`,
    codigoInterno: `PROD-${String(indice + 1).padStart(3, "0")}`,
    nombre,
    categoria,
    unidad,
    precioVenta,
    costoActual: Math.round((precioVenta * 0.7) / 100) * 100,
    stock,
    stockMinimo: 20,
    colorEtiqueta: coloresAmbie[indice % coloresAmbie.length],
    activo: true,
  }));
}

export function semillaUsuarios(): UsuarioSistema[] {
  return [
    { id: "usuario-administrador", nombre: "Perfil administrador", email: "admin@ambie.local", password: "admin123", rol: "administrador", permisos: ["pedidos", "inventario", "caja", "usuarios", "cierre-diario"], activo: true },
    { id: "usuario-vendedor", nombre: "Perfil vendedor", email: "vendedor@ambie.local", password: "vendedor123", rol: "vendedor", permisos: ["clientes", "pedidos", "cobros"], activo: true },
  ];
}

export function semillaPedidos(): Pedido[] {
  const crear = (id: string, numero: string, clienteId: string, lineas: Pedido["lineas"], pago: Pedido["pago"], estado: Pedido["estado"], diasAtras: number, horas: number, minutos: number): Pedido => {
    const creadoEn = fechaRelativa(diasAtras, horas, minutos);
    const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);
    return {
      id,
      numero,
      clienteId,
      vendedorId: "usuario-vendedor",
      lineas,
      subtotal: total,
      total,
      pago,
      estado,
      creadoEn,
      historialEstados: [
        { estado: "pendiente", usuarioId: "usuario-vendedor", fecha: creadoEn },
        ...(estado !== "pendiente" ? [{ estado, usuarioId: "usuario-administrador", fecha: creadoEn }] : []),
      ],
    };
  };

  return [
    crear("pedido-demo-1", "PED-0001", "c1", [{ productoId: "p1", nombre: "Gaseosa Cola 1.5L", cantidad: 4, precioUnitario: 5200, subtotal: 20800 }], { metodo: "efectivo", montoRecibido: 20800, saldoPendiente: 0, estado: "pagado", recordatorioWhatsApp: false }, "entregado", 0, 10, 30),
    crear("pedido-demo-2", "PED-0002", "c3", [{ productoId: "p8", nombre: "Detergente en Polvo 3kg", cantidad: 2, precioUnitario: 24500, subtotal: 49000 }], { metodo: "credito", montoRecibido: 0, saldoPendiente: 49000, estado: "pendiente", recordatorioWhatsApp: true }, "en-preparacion", 0, 11, 15),
    crear("pedido-demo-3", "PED-0003", "c2", [{ productoId: "p2", nombre: "Agua Sin Gas 600ml x12", cantidad: 3, precioUnitario: 18900, subtotal: 56700 }], { metodo: "nequi", montoRecibido: 56700, saldoPendiente: 0, estado: "pagado", recordatorioWhatsApp: false }, "pendiente", 1, 15, 40),
  ];
}

export function semillaMovimientosCaja(): MovimientoCaja[] {
  return semillaPedidos()
    .filter((pedido) => pedido.pago.montoRecibido > 0)
    .map((pedido) => ({
      id: `caja-${pedido.id}`,
      tipo: "ingreso" as const,
      concepto: `Pago ${pedido.numero}`,
      monto: pedido.pago.montoRecibido,
      metodo: pedido.pago.metodo,
      referenciaId: pedido.id,
      creadoEn: pedido.creadoEn,
    }));
}
