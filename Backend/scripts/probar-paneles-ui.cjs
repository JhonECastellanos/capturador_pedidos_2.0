// Navegador real y API/BD QA. No escribe en la instalación del negocio.
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
  assert.equal(base, 'http://localhost:8180', 'Solo frontend QA 8180');
  const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
  const usuarioBd = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
  const sql = consulta => JSON.parse(execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuarioBd, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }));
  const mediciones = [];
  await mkdir(resolve('.local/pruebas-ui'), { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errores = [], lecturas = new Set();
  page.on('pageerror', e => errores.push(e.message));
  page.on('request', r => { if (r.method() === 'GET' && r.url().includes('/api/v1/') && !r.url().includes('/sincronizacion/')) lecturas.add(r); });
  const terminar = r => lecturas.delete(r);
  page.on('requestfinished', terminar); page.on('requestfailed', terminar);
  await page.addInitScript(() => { window.__documentoPrueba = Math.random(); });
  async function reposo() {
    await page.waitForTimeout(100);
    for (let i = 0; lecturas.size && i < 200; i++) await page.waitForTimeout(100);
    assert.equal(lecturas.size, 0, 'Las lecturas deben terminar');
    await page.waitForTimeout(50);
    assert.deepEqual(errores, []);
  }
  async function abrir(nombre, ruta) {
    await page.getByRole('link', { name: nombre, exact: true }).click();
    await page.waitForURL(base + ruta); await reposo();
    assert.ok(!(await page.locator('.admin-pantalla').innerText()).includes('Cargando módulo'));
  }
  async function estable(nombre) {
    const anterior = await page.evaluate(() => {
      const panel = document.querySelector('.admin-pantalla');
      const lista = [...panel.querySelectorAll('.overflow-y-auto')].filter(el => el.scrollHeight > el.clientHeight + 2).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (lista) lista.scrollTop = Math.min(120, lista.scrollHeight - lista.clientHeight);
      window.__panelPrueba = panel; window.__scrollPrueba = lista;
      return { documento: window.__documentoPrueba, scroll: lista?.scrollTop ?? 0 };
    });
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.dispatchEvent(new Event('ambie:datos-actualizados'))); await reposo(); }
    const despues = await page.evaluate(() => ({ documento: window.__documentoPrueba, panelConservado: window.__panelPrueba === document.querySelector('.admin-pantalla'), listaConservada: !window.__scrollPrueba || window.__scrollPrueba.isConnected, scroll: window.__scrollPrueba?.scrollTop ?? 0 }));
    assert.equal(despues.documento, anterior.documento, nombre + ': sin recargar documento');
    if (!despues.panelConservado || !despues.listaConservada) await page.screenshot({ path: resolve('.local/pruebas-ui', `fallo-nodos-${nombre.toLowerCase()}.png`) });
    assert.ok(despues.panelConservado && despues.listaConservada, nombre + ': conserva nodos ' + JSON.stringify({ anterior, despues }));
    assert.ok(Math.abs(despues.scroll - anterior.scroll) <= 1, nombre + ': conserva scroll ' + JSON.stringify({ anterior, despues }));
    console.log(`✓ ${nombre}: tres sincronizaciones sin desmontaje, recarga ni salto de scroll`);
  }
  async function filtro(placeholder, q, visible) {
    const input = page.getByPlaceholder(placeholder); await input.fill(q); await reposo();
    await page.getByText(visible, { exact: false }).first().waitFor();
    await input.fill('ningun-registro-coincide-qa'); await reposo();
    await input.fill(''); await reposo();
  }
  async function sinRecarga(fn) {
    const nonce = await page.evaluate(() => window.__documentoPrueba);
    await fn(); await reposo(); assert.equal(await page.evaluate(() => window.__documentoPrueba), nonce);
  }
  try {
    const login = await context.request.post(base + '/api/v1/auth/login', { data: { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD } });
    assert.equal(login.status(), 200, 'System entra por la API con cookie normal');
    const clientesDemo = (await (await context.request.get(base + '/api/v1/clientes?q=Isabel%20Rojas')).json()).data;
    const productosDemo = (await (await context.request.get(base + '/api/v1/productos?q=Pepsi%20400')).json()).data;
    const clienteDemo = clientesDemo.find(c => c.nombre === 'Isabel Rojas'), productoDemo = productosDemo.find(p => p.nombre === 'Pepsi 400 ml');
    assert.ok(clienteDemo && productoDemo, 'Preparar demo:catalogo en QA');
    for (let i = 0; i < 3; i++) {
      const pedidoHoy = await context.request.post(base + '/api/v1/pedidos', { data: { clienteId: clienteDemo.id, lineas: [{ productoId: productoDemo.id, cantidad: 1 }], estadoInicial: 'entregado', metodo: 'efectivo', momentoCobro: 'inmediato' } });
      assert.equal(pedidoHoy.status(), 201, 'Pedidos ficticios de hoy para validar tarjetas y filtros');
    }
    await page.goto(base + '/admin'); await reposo();
    assert.equal(await page.getByRole('button', { name: 'Actualizar', exact: true }).count(), 0);
    await estable('Inicio');
    const grafica = page.getByText('Ventas vs compras y gastos', { exact: true }).locator('..');
    await sinRecarga(async () => { await grafica.getByRole('button', { name: 'Mes', exact: true }).click(); await reposo(); await grafica.getByRole('button', { name: 'Día', exact: true }).click(); });

    await abrir('Ventas', '/admin/ventas'); await estable('Ventas');
    await filtro('Buscar pedido, cliente o vendedor', 'Isabel', 'Isabel Rojas');
    await page.getByRole('button', { name: /Crear Pedido/ }).click(); await reposo();
    await page.getByPlaceholder('Buscar por nombre, alias o teléfono').fill('Isabel Rojas'); await reposo();
    await page.getByRole('button', { name: 'Isabel Rojas', exact: true }).click();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await page.getByText('Paso 1 de 4 · Cliente', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Volver', exact: true }).click(); await reposo();
    console.log('✓ Ventas: cliente → productos → cliente → inicio');

    await abrir('Pedidos', '/admin/pedidos'); await estable('Pedidos');
    await filtro('Buscar por cliente o consecutivo', 'Isabel', 'Isabel Rojas');
    const primerPedido = page.locator('.admin-pantalla .overflow-y-auto button').filter({ hasText: 'Ver detalle informativo' }).first();
    await primerPedido.click(); await page.getByRole('button', { name: 'Volver', exact: true }).click(); await reposo();
    console.log('✓ Pedidos: búsqueda y detalle → listado');

    await abrir('Créditos', '/admin/creditos'); await estable('Créditos');
    const deuda = page.locator('.admin-pantalla .overflow-y-auto button').filter({ hasText: /Lina Torres/ }).first();
    await deuda.click(); await page.getByRole('button', { name: 'Volver a pendientes' }).click(); await reposo();
    console.log('✓ Créditos: saldo del cliente → pendientes');

    await abrir('Inventario', '/admin/inventario'); await estable('Inventario');
    await page.getByRole('button', { name: /Stock general/ }).click(); await reposo();
    const productos = page.locator('.admin-pantalla .overflow-y-auto article'); assert.equal(await productos.count(), 30);
    await page.getByPlaceholder('Buscar por nombre, código o categoría').fill('Pepsi'); await reposo();
    assert.equal(await productos.count(), 2);
    await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(''); await reposo();
    await page.getByRole('button', { name: 'Volver al menú de inventario' }).click();
    for (const nombre of ['Conteo guiado', 'Descuadres', 'Ajuste manual']) {
      await page.getByRole('button', { name: new RegExp(nombre) }).first().click(); await reposo();
      await page.getByRole('button', { name: 'Volver al menú de inventario' }).click(); await reposo();
    }
    console.log('✓ Inventario: límite 30, filtros y regreso de stock/conteo/descuadres/ajustes');

    await abrir('Compras', '/admin/compras'); await estable('Compras');
    await page.getByRole('button', { name: /Nueva (compra|recepción)/i }).click(); await reposo();
    await page.getByRole('button', { name: 'Volver', exact: true }).click(); await reposo();
    console.log('✓ Compras: nueva recepción → historial sin guardar');

    await abrir('Precios', '/admin/precios'); await estable('Precios');
    await filtro('Buscar por nombre, código o categoría', 'Pepsi', 'Pepsi 400 ml');
    await page.getByPlaceholder('Buscar por nombre, código o categoría').fill('Pepsi 400'); await reposo();
    await page.locator('.admin-pantalla .overflow-y-auto button').filter({ hasText: 'Pepsi 400 ml' }).first().click();
    await page.locator('input[type=number]').fill('3700');
    await page.getByRole('button', { name: /Revisar/ }).click();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    assert.equal(await page.locator('input[type=number]').inputValue(), '3700');
    await page.getByRole('button', { name: 'Volver', exact: true }).click(); await reposo();
    console.log('✓ Precios: revisión → edición conserva el precio, sin escritura');

    await abrir('Caja', '/admin/caja'); await estable('Caja');
    await page.locator('.admin-pantalla button').filter({ has: page.getByText('Efectivo', { exact: true }) }).click(); await reposo();
    await page.locator('.admin-pantalla button').filter({ has: page.getByText('Efectivo', { exact: true }) }).click(); await reposo();
    await page.getByRole('button', { name: /Nuevo egreso/ }).click();
    await page.getByLabel('Concepto', { exact: true }).fill('Compra de servilletas (borrador QA)');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await reposo();
    console.log('✓ Caja: filtro reversible y cancelar egreso sin escritura');

    await abrir('Cierre', '/admin/cierre'); await estable('Cierre');
    await page.getByRole('button', { name: '+ Hacer Cierre', exact: true }).click(); await reposo();
    const dinero = page.locator('.admin-pantalla input[type=number]');
    await dinero.nth(0).fill('12345'); await dinero.nth(1).fill('6789');
    await page.getByRole('button', { name: 'Continuar al resumen de hoy', exact: true }).click(); await reposo();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    assert.equal(await dinero.nth(0).inputValue(), '12345');
    await page.getByRole('button', { name: 'Volver', exact: true }).click(); await reposo();
    console.log('✓ Cierre: conteo → resumen → conteo conserva valores → historial');

    await abrir('Usuarios', '/admin/usuarios'); await estable('Usuarios');
    await filtro('Buscar usuario, correo o rol', 'system', 'system');
    await page.getByRole('button', { name: '+ Nuevo Usuario', exact: true }).click();
    await page.getByPlaceholder('Ej. Laura Gómez').fill('Elena Restrepo'); await page.getByPlaceholder('correo@negocio.com').fill('elena@pruebas.invalid');
    await page.locator('input[type=password]').fill('SoloPruebas2026!');
    await page.getByRole('button', { name: 'Revisar →', exact: true }).click();
    await page.getByRole('button', { name: /Editar|Volver/ }).first().click();
    assert.equal(await page.getByPlaceholder('Ej. Laura Gómez').inputValue(), 'Elena Restrepo');
    await page.getByRole('button', { name: 'Volver', exact: true }).last().click(); await reposo();
    console.log('✓ Usuarios: revisión → edición conserva borrador; no se crea acceso');

    await abrir('Auditoría', '/admin/auditoria'); await estable('Auditoría');
    await page.getByRole('combobox').selectOption('pedidos'); await reposo();
    await page.getByRole('combobox').selectOption(''); await reposo();
    await abrir('Configuración', '/admin/configuracion'); await estable('Configuración');
    await page.getByRole('heading', { name: 'Configuración general', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Administrar usuarios', exact: true }).waitFor();
    await abrir('Inicio', '/admin'); console.log('✓ Configuración general y regreso');

    for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 320 }, { width: 1440, height: 320 }]) {
      await page.setViewportSize(viewport); await abrir('Precios', '/admin/precios');
      const tarjeta = page.locator('.admin-pantalla .overflow-y-auto button').first();
      const altura = (await tarjeta.boundingBox()).height; assert.ok(altura >= 64, 'La tarjeta no se aplasta');
      const lista = await tarjeta.evaluate(el => el.parentElement.clientHeight); assert.ok(lista >= 160, 'La lista conserva altura mínima');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desborde horizontal');
      if (viewport.height === 320) assert.ok(await page.locator('.admin-contenido').evaluate(el => el.scrollHeight > el.clientHeight), 'Ventana baja desplaza el panel');
      await page.screenshot({ path: resolve('.local/pruebas-ui', `precios-${viewport.width}x${viewport.height}.png`) });
    }
    console.log('✓ 390×844, 390×320 y 1440×320: tarjetas ≥64 px, lista ≥160 px y scroll del panel');
    // Venta exclusivamente QA, desde el formulario real hasta PostgreSQL y la factura.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/admin/ventas/clientes/nuevo'); await reposo();
    const nombreCliente = `Validación formulario ${Date.now()}`;
    await page.getByPlaceholder('Ej. Jaimito el de los pantalones').fill(nombreCliente);
    await page.getByPlaceholder('300 000 0000').fill('3009999981');
    await page.getByPlaceholder('Ej. Local 12 · Calle 45 #12-30').fill('Dirección de pruebas');
    await page.locator('input[type=date]').fill('1990-05-21');
    const guardadoCliente = page.waitForResponse(r => r.url().endsWith('/api/v1/clientes') && r.request().method() === 'POST');
    const inicioCliente = performance.now();
    await page.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
    const respuestaCliente = await guardadoCliente; assert.equal(respuestaCliente.status(), 201);
    const confirmadoClienteMs = performance.now() - inicioCliente;
    const clienteFormulario = (await respuestaCliente.json()).data;
    assert.match(clienteFormulario.id, /^[a-f0-9-]{36}$/i);
    const filaCliente = sql(`SELECT row_to_json(c) FROM clientes c WHERE c.id='${clienteFormulario.id}';`);
    assert.equal(filaCliente.nombre, nombreCliente); assert.equal(filaCliente.telefono, '3009999981');
    assert.equal(filaCliente.direccion, 'Dirección de pruebas'); assert.equal(filaCliente.fechaNacimiento, '1990-05-21');
    mediciones.push({ formulario: 'cliente', respuestaConfirmadaMs: +confirmadoClienteMs.toFixed(1), bdObservadaMs: +(performance.now()-inicioCliente).toFixed(1), correcto: true });
    console.log('✓ Cliente: datos digitados y fecha coinciden con PostgreSQL al responder el guardado');

    const marcaFactura = `QA-Factura-${Date.now()}`;
    const productosFactura = [];
    for (const [nombre, precioVenta] of [['Coca-Cola 400 ml', 3500], ['Doritos queso', 5200]]) {
      const res = await context.request.post(base + '/api/v1/productos', { data: { nombre: `${marcaFactura} ${nombre}`, precioVenta, costoActual: 2000, stock: 10 } });
      assert.equal(res.status(), 201); productosFactura.push((await res.json()).data);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/admin/ventas/pedido'); await reposo();
    await page.getByText('Venta abierta · cliente ocasional', { exact: true }).click();
    for (const [i, producto] of productosFactura.entries()) {
      await page.getByPlaceholder('Buscar producto o código').fill(producto.nombre);
      await page.getByRole('button', { name: `Agregar ${producto.nombre}`, exact: true }).click();
      for (let n = 0; n < i + 1; n++) await page.getByRole('button', { name: 'Aumentar cantidad', exact: true }).click();
    }
    await page.getByRole('button', { name: /Continuar a entrega/ }).click();
    await page.getByRole('button', { name: /Entregado ahora/ }).click();
    await page.getByRole('button', { name: /Continuar al pago/ }).click();
    const guardadoFactura = page.waitForResponse(r => r.url().endsWith('/api/v1/pedidos') && r.request().method() === 'POST');
    const inicioFactura = performance.now();
    await page.getByRole('button', { name: /Confirmar pedido/ }).click();
    const respuestaFactura = await guardadoFactura; assert.equal(respuestaFactura.status(), 201);
    const confirmadoFacturaMs = performance.now() - inicioFactura;
    const factura = (await respuestaFactura.json()).data;
    assert.match(factura.id, /^[a-f0-9-]{36}$/i);
    const filaPedido = sql(`SELECT json_build_object('total', p.total, 'estado', p.estado, 'metodo', p.metodo, 'clienteId', p."clienteId", 'lineas', (SELECT json_agg(json_build_object('productoId', l."productoId", 'cantidad', l.cantidad, 'precioUnitario', l."precioUnitario", 'subtotal', l.subtotal) ORDER BY l.orden) FROM "pedidoLineas" l WHERE l."pedidoId"=p.id), 'pagado', (SELECT COALESCE(SUM(a."montoAplicado"),0) FROM "pagoAplicaciones" a WHERE a."pedidoId"=p.id AND a."revertidoEn" IS NULL), 'caja', (SELECT COALESCE(SUM(CASE WHEN m.tipo='ingreso' THEN m.monto ELSE -m.monto END),0) FROM "movimientosCaja" m WHERE m."pagoId" IN (SELECT a."pagoId" FROM "pagoAplicaciones" a WHERE a."pedidoId"=p.id))) FROM pedidos p WHERE p.id='${factura.id}';`);
    assert.equal(filaPedido.total, 22600); assert.equal(filaPedido.pagado, 22600); assert.equal(filaPedido.caja, 22600);
    assert.equal(filaPedido.estado, 'entregado'); assert.equal(filaPedido.metodo, 'efectivo'); assert.equal(filaPedido.clienteId, null);
    assert.deepEqual(filaPedido.lineas, factura.lineas.map(l => ({ productoId: l.productoId, cantidad: l.cantidad, precioUnitario: l.precioUnitario, subtotal: l.subtotal })));
    mediciones.push({ formulario: 'pedido', respuestaConfirmadaMs: +confirmadoFacturaMs.toFixed(1), bdObservadaMs: +(performance.now()-inicioFactura).toFixed(1), total: filaPedido.total, cantidades: filaPedido.lineas.map(l=>l.cantidad), correcto: true });
    await page.waitForURL(base + '/admin/ventas/completado');
    const detalleFactura = page.getByRole('region', { name: 'Detalle de productos' });
    await detalleFactura.waitFor(); assert.equal(await detalleFactura.locator('li').count(), 2);
    assert.equal(factura.total, 22600);
    for (const [i, producto] of productosFactura.entries()) {
      const fila = detalleFactura.locator('li').filter({ hasText: producto.nombre });
      assert.match(await fila.innerText(), new RegExp(`Cantidad: ${i + 2}`));
      assert.ok((await fila.innerText()).includes(i === 0 ? '3.500' : '5.200'));
      const cambio = await context.request.post(base + `/api/v1/productos/${producto.id}/precio`, { data: { nuevoPrecio: 9000 } });
      assert.equal(cambio.status(), 201);
    }
    const lecturaFactura = await context.request.get(base + `/api/v1/pedidos/${factura.id}`);
    assert.equal(lecturaFactura.status(), 200);
    assert.deepEqual((await lecturaFactura.json()).data.lineas, factura.lineas);
    await page.reload(); await detalleFactura.waitFor();
    assert.ok(!(await detalleFactura.innerText()).includes('9.000'));
    await page.screenshot({ path: resolve('.local/pruebas-ui', 'factura-real-qa.png') });
    console.log('✓ Factura móvil: venta real QA de dos productos, cantidades 2/3, persistencia y precios históricos tras cambio y recarga');
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const resumen = (await (await context.request.get(base + `/api/v1/dashboard/resumen?desde=${hoy}&hasta=${hoy}`)).json()).data;
    const totalesBd = sql(`SELECT json_build_object('ventas', COALESCE(SUM(total),0), 'pedidos', COUNT(*)) FROM pedidos WHERE "fechaOperacion"='${hoy}'::date AND estado<>'cancelado';`);
    assert.equal(resumen.ventas, totalesBd.ventas); assert.equal(resumen.pedidos, totalesBd.pedidos);
    assert.equal(resumen.ticketPromedio, totalesBd.pedidos ? Math.round(totalesBd.ventas / totalesBd.pedidos * 100) / 100 : 0);
    await writeFile(resolve('.local/pruebas-ui', 'conciliacion-formularios.json'), JSON.stringify({ fecha: new Date().toISOString(), base, mediciones, totalesBd, alcance: 'Click a respuesta confirmada; la observación posterior incluye Docker/psql. No mide por separado el instante interno del commit.' }, null, 2));
    console.log('✓ Totales: ventas, cantidad de pedidos y ticket promedio coinciden en API y PostgreSQL');
    assert.deepEqual(errores, []);
  } finally { await context.close(); await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
