import assert from "node:assert/strict";
import type { AbonoDTO, UsuarioDTO } from "@ambie/contrato";

// Este recorrido escribe exclusivamente contra la instancia aislada de pruebas.
const BASE = process.env.BASE_PRUEBAS_API ?? "http://localhost:3100/api/v1";
assert.ok(["http://localhost:3100/api/v1", "http://localhost:8180/api/v1"].includes(BASE), "Las pruebas solo pueden escribir en la instancia QA 3100/8180");
const clavePruebas = "SoloPruebas2026!";
let token = "";
let pasos = 0;
const marca = `QA-${Date.now()}`;

async function http(ruta: string, metodo = "GET", datos?: unknown, credencial = token) {
  const res = await fetch(`${BASE}${ruta}`, { method: metodo, signal: AbortSignal.timeout(20000), headers: { ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}), ...(datos === undefined ? {} : { "Content-Type": "application/json" }) }, body: datos === undefined ? undefined : JSON.stringify(datos) });
  const cuerpo = await res.json() as { data?: unknown; message?: string; meta?: { total: number } };
  return { status: res.status, cuerpo };
}
async function pedir<T>(ruta: string, metodo = "GET", datos?: unknown, credencial = token): Promise<T> {
  const r = await http(ruta, metodo, datos, credencial);
  assert.ok(r.status >= 200 && r.status < 300, `${metodo} ${ruta}: ${r.status} ${r.cuerpo.message ?? ""}`);
  return r.cuerpo.data as T;
}
async function caso(nombre: string, fn: () => Promise<void>) { await fn(); pasos++; console.log(`✓ ${nombre}`); }
async function todos<T>(ruta: string): Promise<T[]> {
  const registros: T[] = [];
  for (let page = 1; ; page++) {
    const r = await http(`${ruta}${ruta.includes("?") ? "&" : "?"}page=${page}&pageSize=200`);
    assert.equal(r.status, 200);
    const lote = r.cuerpo.data as T[];
    registros.push(...lote);
    if (!lote.length || registros.length >= (r.cuerpo.meta?.total ?? registros.length)) return registros;
  }
}
type Pedido = { id: string; numero: string; estado: string; pago: { saldoPendiente: number }; historialEstados: Array<{ estado: string }> };
type Producto = { id: string; stock: number; stockFisico: number; stockReservado: number };

async function main() {
  console.log("Pruebas integrales sobre ambie-integracion, puerto 3100. Se conservan los recursos de prueba.");
  await pedir("/salud", "GET", undefined, "");
  const email = process.env.BOOTSTRAP_EMAIL;
  const password = process.env.BOOTSTRAP_PASSWORD;
  assert.ok(email && password, "Configura BOOTSTRAP_EMAIL y BOOTSTRAP_PASSWORD en .env");
  let entrada = await http("/auth/login", "POST", { identifier: email, password }, "");
  if (entrada.status === 401) entrada = await http("/auth/login", "POST", { identifier: "system", password: process.env.SYSTEM_PASSWORD || password }, "");
  if (entrada.status === 401) {
    await pedir("/auth/bootstrap", "POST", { email, password }, "");
    entrada = await http("/auth/login", "POST", { identifier: email, password }, "");
  }
  assert.equal(entrada.status, 200);
  const sesion = entrada.cuerpo.data as { accessToken: string; usuario: UsuarioDTO };
  token = sesion.accessToken;
  const actor = sesion.usuario;
  assert.equal(actor.rol, "administrador");

  const existentes = await pedir<UsuarioDTO[]>("/usuarios");
  await caso("system único, autenticado, con permisos completos y protegido", async () => {
    const sistemas = existentes.filter((u) => u.esSistema);
    assert.equal(sistemas.length, 1); assert.equal(sistemas[0].nombre, "system");
    const sistema = await pedir<{ accessToken: string; usuario: UsuarioDTO }>("/auth/login", "POST", { identifier: "system", password: process.env.SYSTEM_PASSWORD || password }, "");
    assert.equal(sistema.usuario.id, sistemas[0].id);
    for (const permiso of ["usuarios", "pedidos", "clientes", "cobros", "inventario", "caja", "cierre-diario"]) assert.ok(sistema.usuario.permisos.includes(permiso));
    assert.equal((await http(`/usuarios/${sistemas[0].id}/estado`, "PATCH")).status, 409);
    assert.equal((await http(`/usuarios/${sistemas[0].id}/rol`, "PATCH", { rol: "vendedor" })).status, 409);
    assert.equal((await http("/usuarios", "POST", { nombre: " SYSTEM ", email: `${marca}@reservado.invalid`, password: clavePruebas, rol: "administrador" })).status, 409);
    assert.equal((await http("/auth/login", "POST", { identifier: "system", password: "ClaveIncorrecta!" }, "")).status, 401);
    await pedir("/usuarios", "POST", { nombre: "Administrador creado por system", email: `${marca.toLowerCase()}-system@pruebas.invalid`, password: clavePruebas, rol: "administrador" }, sistema.accessToken);
  });
  for (const [correo, rol] of [["qa-admin@pruebas.invalid", "administrador"], ["qa-vendedor@pruebas.invalid", "vendedor"]] as const) {
    if (!existentes.some((u) => u.email === correo)) await pedir("/usuarios", "POST", { nombre: `Validación ${rol}`, email: correo, rol, password: clavePruebas });
  }
  const vendedor = await pedir<{ accessToken: string; usuario: UsuarioDTO }>("/auth/login", "POST", { identifier: "qa-vendedor@pruebas.invalid", password: clavePruebas }, "");
  await caso("permisos administrativos se aplican en la API", async () => {
    for (const ruta of ["/usuarios", "/dashboard/resumen", "/inventario/conteos", "/auditoria", "/caja/movimientos"]) assert.equal((await http(ruta, "GET", undefined, vendedor.accessToken)).status, 403, ruta);
    assert.equal((await http(`/usuarios/${actor.id}/estado`, "PATCH")).status, 409);
  });
  await caso("roles, revocación, renovación y cierre de sesión", async () => {
    const emailTemporal = `${marca.toLowerCase()}@pruebas.invalid`;
    const nuevo = await pedir<{ id: string }>("/usuarios", "POST", { nombre: "Acceso QA", email: emailTemporal, rol: "vendedor", password: clavePruebas });
    const acceso = await pedir<{ accessToken: string; refreshToken: string }>("/auth/login", "POST", { identifier: emailTemporal, password: clavePruebas }, "");
    await pedir(`/usuarios/${nuevo.id}/rol`, "PATCH", { rol: "administrador" });
    assert.equal((await http("/auth/me", "GET", undefined, acceso.accessToken)).status, 401);
    assert.equal((await http("/auth/refresh", "POST", { refreshToken: acceso.refreshToken }, "")).status, 401);
    const actual = await pedir<{ accessToken: string; refreshToken: string; usuario: UsuarioDTO }>("/auth/login", "POST", { identifier: emailTemporal, password: clavePruebas }, "");
    assert.equal(actual.usuario.rol, "administrador");
    const renovado = await pedir<{ accessToken: string }>("/auth/refresh", "POST", { refreshToken: actual.refreshToken }, "");
    assert.equal((await http("/auth/refresh", "POST", { refreshToken: actual.refreshToken }, "")).status, 401);
    await pedir("/auth/logout", "POST", {}, renovado.accessToken);
    assert.equal((await http("/auth/me", "GET", undefined, renovado.accessToken)).status, 401);
    await pedir(`/usuarios/${nuevo.id}/estado`, "PATCH");
    assert.equal((await http("/auth/login", "POST", { identifier: emailTemporal, password: clavePruebas }, "")).status, 401);
  });

  const c = await pedir<{ id: string }>("/clientes", "POST", { nombre: `${marca} cliente`, telefono: "3000000000", direccion: "Entorno de pruebas", tipoCredito: "semanal" });
  const producto = await pedir<Producto>("/productos", "POST", { nombre: `${marca} producto`, precioVenta: 100, costoActual: 40, stock: 10, stockMinimo: 2 });
  const crearPedido = (clienteId: string, productoId: string, cantidad: number, estadoInicial = "pendiente") => pedir<Pedido>("/pedidos", "POST", { clienteId, lineas: [{ productoId, cantidad }], metodo: "credito", estadoInicial });
  await caso("caché: $100 → hit → venta $50 → $150; pago, cancelación y gasto invalidan", async () => {
    type Totales = { ventas: number; creditoPendiente: number; gastos: number; utilidad: number; serie: Array<{ ventas: number }>; cache: { estado: string; version: string } };
    const cliente = await pedir<{ id: string }>("/clientes", "POST", { nombre: `${marca} caché`, telefono: "3000000010", direccion: "Pruebas" });
    const articulo = await pedir<Producto>("/productos", "POST", { nombre: `${marca} caché`, precioVenta: 50, costoActual: 20, stock: 20 });
    await crearPedido(cliente.id, articulo.id, 2);
    const ruta = `/dashboard/totales?clienteId=${cliente.id}`;
    const primero = await pedir<Totales>(ruta);
    const segundo = await pedir<Totales>(ruta);
    assert.equal(primero.ventas, 100); assert.equal(primero.cache.estado, "miss");
    assert.equal(segundo.ventas, 100); assert.equal(segundo.cache.estado, "hit");
    assert.equal(segundo.cache.version, primero.cache.version);
    const venta = await crearPedido(cliente.id, articulo.id, 1);
    const tercero = await pedir<Totales>(ruta);
    assert.equal(tercero.ventas, 150); assert.equal(tercero.cache.estado, "miss");
    assert.notEqual(tercero.cache.version, segundo.cache.version);
    assert.equal(tercero.serie.reduce((s, f) => s + f.ventas, 0), 150);
    await pedir(`/pedidos/${venta.id}/pagos`, "POST", { metodo: "efectivo" });
    const pagado = await pedir<Totales>(ruta);
    assert.equal(pagado.ventas, 150); assert.equal(pagado.creditoPendiente, 100);
    assert.notEqual(pagado.cache.version, tercero.cache.version);
    await pedir(`/pedidos/${venta.id}/estado`, "PATCH", { estado: "cancelado" });
    const cancelado = await pedir<Totales>(ruta);
    assert.equal(cancelado.ventas, 100); assert.equal(cancelado.creditoPendiente, 100);
    await pedir("/gastos", "POST", { concepto: `${marca} caché gasto`, monto: 25 });
    const gasto = await pedir<Totales>(ruta);
    assert.equal(gasto.gastos, cancelado.gastos + 25);
    assert.equal(gasto.utilidad, cancelado.utilidad - 25);
    const antesFallo = await pedir<Totales>(ruta);
    assert.equal((await http("/pedidos", "POST", { clienteId: cliente.id, lineas: [{ productoId: articulo.id, cantidad: 999 }], metodo: "credito" })).status, 400);
    const despuesFallo = await pedir<Totales>(ruta);
    assert.equal(despuesFallo.cache.version, antesFallo.cache.version);
    assert.equal(despuesFallo.cache.estado, "hit");
    assert.equal((await http("/dashboard/totales?desde=2026-02-30")).status, 400);
    assert.equal((await http("/dashboard/totales?desde=1900-01-01&hasta=2026-09-30")).status, 400);
  });
  await caso("venta ocasional: sin cliente ficticio, sin crédito, con caja y reversión", async () => {
    const datos = { clienteId: null, lineas: [{ productoId: producto.id, cantidad: 1 }], metodo: "efectivo", estadoInicial: "entregado" };
    assert.equal((await http("/pedidos", "POST", { ...datos, metodo: "credito" })).status, 400);
    const venta = await pedir<Pedido & { clienteId: string | null; facturaNumero: string }>("/pedidos", "POST", datos);
    assert.equal(venta.clienteId, null); assert.equal(venta.pago.saldoPendiente, 0); assert.ok(venta.facturaNumero);
    const abierto = await pedir<Pedido>("/pedidos", "POST", { ...datos, estadoInicial: "pendiente" });
    await pedir(`/pedidos/${abierto.id}/pagos`, "POST", { metodo: "billetera" });
    await pedir(`/pedidos/${abierto.id}/estado`, "PATCH", { estado: "cancelado" });
    assert.equal((await pedir<Pedido>(`/pedidos/${abierto.id}`)).pago.saldoPendiente, 0);
    await pedir("/recepciones-compra", "POST", { proveedorId: (await pedir<{ id: string }>("/proveedores", "POST", { nombre: `${marca} reposición prueba` })).id, lineas: [{ productoId: producto.id, cantidad: 1, costoUnitario: 40 }], descontarCaja: false });
  });
  const p1 = await crearPedido(c.id, producto.id, 3);
  const p2 = await crearPedido(c.id, producto.id, 2, "entregado");
  await caso("validación rechaza líneas repetidas y cantidades fraccionarias", async () => {
    assert.equal((await http("/pedidos", "POST", { clienteId: c.id, lineas: [{ productoId: producto.id, cantidad: 6 }, { productoId: producto.id, cantidad: 6 }], metodo: "credito" })).status, 400);
    assert.equal((await http("/inventario/ajustes", "POST", { productoId: producto.id, stockFisico: 1.5 })).status, 400);
    assert.equal((await http("/inventario/ajustes", "POST", { productoId: producto.id, stockFisico: 2 })).status, 400);
  });
  await caso("pedido, reserva y stock disponible se sincronizan", async () => {
    assert.equal(p1.estado, "pendiente"); assert.equal(p2.estado, "entregado");
    const p = await pedir<Producto>(`/productos/${producto.id}`);
    assert.equal(p.stockFisico, 8); assert.equal(p.stockReservado, 3); assert.equal(p.stock, 5);
  });
  await caso("abono FIFO y cancelación preservan cartera y caja", async () => {
    const a = await pedir<AbonoDTO>(`/clientes/${c.id}/abonos`, "POST", { monto: 350, metodo: "efectivo" });
    assert.equal(a.pedidosAfectados[0].pedidoId, p1.id); assert.equal(a.pedidosAfectados[0].montoAplicado, 300);
    assert.equal(a.pedidosAfectados[1].pedidoId, p2.id); assert.equal(a.pedidosAfectados[1].montoAplicado, 50);
    const cancelado = await pedir<Pedido>(`/pedidos/${p1.id}/estado`, "PATCH", { estado: "cancelado" });
    assert.equal(cancelado.estado, "cancelado"); assert.equal(cancelado.pago.saldoPendiente, 0);
    assert.equal((await pedir<{ saldoPendiente: number }>(`/clientes/${c.id}`)).saldoPendiente, 150);
    assert.equal((await pedir<Producto>(`/productos/${producto.id}`)).stockReservado, 0);
    const caja = await todos<{ concepto: string; monto: number; tipo: string }>("/caja/movimientos");
    assert.ok(caja.some((m) => m.concepto === `Reverso ${p1.numero}` && m.tipo === "egreso" && m.monto === 300));
    assert.equal((await http(`/pedidos/${p1.id}/pagos`, "POST", { metodo: "efectivo" })).status, 400);
  });
  await caso("dos ventas simultáneas no sobrevenden la última unidad", async () => {
    const ultimo = await pedir<Producto>("/productos", "POST", { nombre: `${marca} última unidad`, precioVenta: 100, stock: 1 });
    const otro = await pedir<{ id: string }>("/clientes", "POST", { nombre: `${marca} segundo cliente`, telefono: "3000000001", direccion: "Pruebas" });
    const ventas = await Promise.all([c.id, otro.id].map((clienteId) => http("/pedidos", "POST", { clienteId, lineas: [{ productoId: ultimo.id, cantidad: 1 }], metodo: "credito", estadoInicial: "entregado" })));
    assert.equal(ventas.filter((r) => r.status === 201).length, 1); assert.equal(ventas.filter((r) => r.status === 400).length, 1);
    assert.equal((await pedir<Producto>(`/productos/${ultimo.id}`)).stockFisico, 0);
  });
  await caso("cobro directo y FIFO simultáneos no duplican el dinero", async () => {
    const otro = await pedir<{ id: string }>("/clientes", "POST", { nombre: `${marca} cobros`, telefono: "3000000002", direccion: "Pruebas" });
    const pedido = await crearPedido(otro.id, producto.id, 1, "entregado");
    const respuestas = await Promise.all([http(`/pedidos/${pedido.id}/pagos`, "POST", { metodo: "efectivo" }), http(`/clientes/${otro.id}/abonos`, "POST", { monto: 100, metodo: "efectivo" })]);
    assert.equal(respuestas.filter((r) => r.status === 201).length, 1);
    assert.equal((await pedir<Pedido>(`/pedidos/${pedido.id}`)).pago.saldoPendiente, 0);
  });
  await caso("conteo parcial ajusta solo las líneas digitadas", async () => {
    const conteo = await pedir<{ id: string }>("/inventario/conteos", "POST", { tipo: "general", turno: "validación" });
    await pedir(`/inventario/conteos/${conteo.id}/lineas/${producto.id}`, "PATCH", { stockFisico: 6 });
    await pedir(`/inventario/conteos/${conteo.id}/finalizar`, "POST");
    await pedir(`/inventario/conteos/${conteo.id}/aplicar-ajuste`, "POST");
    assert.equal((await pedir<Producto>(`/productos/${producto.id}`)).stockFisico, 6);
    assert.ok((await pedir<unknown[]>("/inventario/ajustes")).length > 0);
    assert.equal((await http(`/inventario/conteos/${conteo.id}/aplicar-ajuste`, "POST")).status, 409);
  });
  await caso("foto y comprobante sobreviven fuera del navegador", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
    const archivo = await pedir<{ id: string }>(`/archivos/productos/${producto.id}`, "POST", { nombre: "validacion.png", dataUrl });
    await pedir(`/archivos/pedidos/${p2.id}`, "POST", { nombre: "comprobante.png", dataUrl });
    const respuesta = await fetch(`${BASE}/archivos/${archivo.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(respuesta.status, 200); assert.equal(respuesta.headers.get("content-type"), "image/png"); assert.ok((await respuesta.arrayBuffer()).byteLength > 0);
    assert.equal((await http(`/archivos/productos/${producto.id}`, "POST", { nombre: "invalido.png", dataUrl: "data:image/png;base64,ZmFsc28=" })).status, 400);
  });
  await caso("compras, gastos y precios se reflejan en caja e historial", async () => {
    const proveedor = await pedir<{ id: string }>("/proveedores", "POST", { nombre: `${marca} proveedor` });
    await pedir("/recepciones-compra", "POST", { proveedorId: proveedor.id, lineas: [{ productoId: producto.id, cantidad: 2, costoUnitario: 45 }], descontarCaja: true });
    assert.equal((await pedir<Producto>(`/productos/${producto.id}`)).stockFisico, 8);
    await pedir("/gastos", "POST", { concepto: `${marca} gasto`, monto: 25, metodo: "efectivo" });
    await pedir(`/productos/${producto.id}/precio`, "POST", { nuevoPrecio: 125 });
    const historial = await pedir<Array<{ productoId: string }>>("/productos/cambios-precio");
    assert.ok(historial.some((cambio) => cambio.productoId === producto.id));
  });
  await caso("venta ocasional no crea clientes ni admite crédito y revierte su cobro", async () => {
    const clientesAntes = (await http("/clientes?pageSize=1")).cuerpo.meta?.total;
    const stockAntes = await pedir<Producto>(`/productos/${producto.id}`);
    const datos = { clienteId: null, lineas: [{ productoId: producto.id, cantidad: 1 }], estadoInicial: "pendiente", momentoCobro: "inmediato" };
    assert.equal((await http("/pedidos", "POST", { ...datos, metodo: "credito" }, vendedor.accessToken)).status, 400);
    const ocasional = await pedir<Pedido & { clienteId: string | null; clienteNombre: string }>("/pedidos", "POST", { ...datos, metodo: "efectivo" }, vendedor.accessToken);
    assert.equal(ocasional.clienteId, null);
    assert.equal(ocasional.clienteNombre, "Venta ocasional");
    assert.equal(ocasional.pago.saldoPendiente, 0);
    assert.equal((await pedir<Producto>(`/productos/${producto.id}`)).stockReservado, stockAntes.stockReservado + 1);
    await pedir(`/pedidos/${ocasional.id}/estado`, "PATCH", { estado: "cancelado" }, vendedor.accessToken);
    const caja = await todos<{ concepto: string; tipo: string; monto: number }>("/caja/movimientos");
    assert.ok(caja.some((m) => m.concepto === `Reverso ${ocasional.numero}` && m.tipo === "egreso" && m.monto === 125));
    assert.deepEqual(await pedir<Producto>(`/productos/${producto.id}`), stockAntes);
    assert.equal((await http("/clientes?pageSize=1")).cuerpo.meta?.total, clientesAntes);
  });
  await caso("tablero, auditoría y previsualización del cierre responden", async () => {
    const tablero = await pedir<{ serie: unknown[]; utilidad: number; alertasStock: number }>("/dashboard/resumen?dias=7");
    assert.equal(tablero.serie.length, 7); assert.ok(Number.isFinite(tablero.utilidad));
    const auditoria = await pedir<Array<{ usuarioId: string; accion: string }>>("/auditoria");
    assert.ok(auditoria.some((e) => e.usuarioId === actor.id));
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const cierre = await pedir<{ efectivoEsperado: number; totalIngresos: number; totalEgresos: number }>(`/cierres/${hoy}/previsualizacion`);
    const movimientos = await todos<{ tipo: string; monto: number; metodo: string; fechaContable: string }>("/caja/movimientos");
    const esperado = movimientos.filter((m) => m.metodo === "efectivo" && m.fechaContable.slice(0, 10) === hoy).reduce((s, m) => s + (m.tipo === "ingreso" ? m.monto : -m.monto), 0);
    assert.equal(cierre.efectivoEsperado, esperado);
  });
  await caso("cierre conserva reversión y rechaza duplicados", async () => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const anteriores = await todos<{ fecha: string }>("/cierres");
    if (!anteriores.some((c) => c.fecha.slice(0, 10) === hoy)) {
      const cancelable = await pedir<Pedido>("/pedidos", "POST", { clienteId: c.id, metodo: "credito", estadoInicial: "pendiente", lineas: [{ productoId: producto.id, cantidad: 1 }] });
      await pedir(`/pedidos/${cancelable.id}/pagos`, "POST", { metodo: "efectivo" });
      const antes = await pedir<{ efectivoEsperado: number }>(`/cierres/${hoy}/previsualizacion`);
      const cierre = await pedir<{ pendientesCancelados: number; totalVentas: number }>(`/cierres/${hoy}`, "POST", { cancelar: [cancelable.id], conteoEfectivo: antes.efectivoEsperado - 125, conteoBilletera: 0 });
      assert.equal(cierre.pendientesCancelados, 1);
      assert.equal((await pedir<Pedido>(`/pedidos/${cancelable.id}`)).estado, "cancelado");
      const despues = await pedir<{ efectivoEsperado: number; totalVentas: number }>(`/cierres/${hoy}/previsualizacion`);
      assert.equal(despues.efectivoEsperado, antes.efectivoEsperado - 125);
      assert.equal(cierre.totalVentas, despues.totalVentas);
    } else console.log("  Cierre existente conservado: esta repetición valida solo el rechazo de duplicados.");
    assert.equal((await http(`/cierres/${hoy}`, "POST", {})).status, 409);
  });
  await caso("paginación remota, búsqueda y fechas acotadas", async () => {
    const primera = await http("/pedidos?page=1&pageSize=1");
    const segunda = await http("/pedidos?page=2&pageSize=1");
    assert.equal(primera.status, 200); assert.equal(segunda.status, 200);
    const a = primera.cuerpo.data as Pedido[];
    const b = segunda.cuerpo.data as Pedido[];
    assert.equal(a.length, 1); assert.equal(b.length, 1);
    assert.notEqual(a[0].id, b[0].id);
    assert.equal(primera.cuerpo.meta?.total, segunda.cuerpo.meta?.total);
    const buscados = await pedir<Pedido[]>(`/pedidos?q=${encodeURIComponent(a[0].numero)}&pageSize=1`);
    assert.equal(buscados[0].id, a[0].id);
    assert.equal((await http("/pedidos?pageSize=201")).status, 400);
    assert.equal((await http("/pedidos?desde=2026-02-30")).status, 400);
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const hoy = await todos<Pedido & { fechaOperacion: string }>(`/pedidos?desde=${dia}&hasta=${dia}`);
    assert.ok(hoy.length > 0); assert.ok(hoy.every((p) => p.fechaOperacion.slice(0, 10) === dia));
  });
  console.log(`\n${pasos} casos de integración correctos. Datos del negocio intactos.`);
}
main().catch((e: Error) => { console.error(`✗ ${e.message}`); process.exitCode = 1; });
