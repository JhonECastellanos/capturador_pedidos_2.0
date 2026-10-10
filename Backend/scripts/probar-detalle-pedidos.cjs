const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Solo QA: reutiliza pedidos existentes y no registra operaciones comerciales.
const baseApi = process.env.BASE_PRUEBAS_API || 'http://localhost:8180/api/v1';
assert.ok(['http://localhost:8180/api/v1', 'http://localhost:3100/api/v1'].includes(baseApi), 'La prueba solo admite QA');
const base = 'http://localhost:8180';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390, hasTouch: width === 390 });
      try {
        const login = await context.request.post(baseApi + '/auth/login', { data: { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' } });
        assert.equal(login.status(), 200);
        const respuesta = await context.request.get(baseApi + '/pedidos?segmento=historial&pageSize=5');
        assert.equal(respuesta.status(), 200);
        const { data: pedidos } = await respuesta.json();
        assert.ok(pedidos.length > 0, 'Preparar primero el catálogo QA');
        const pedido = pedidos[0];
        const page = await context.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        // La factura llena la caché con {data}; después se reutiliza en el historial.
        await page.goto(base + '/admin/ventas/completado');
        await page.evaluate(id => history.replaceState({ usr: { pedidoId: id }, key: 'prueba-detalle', idx: 0 }, '', '/admin/ventas/completado'), pedido.id);
        await page.reload();
        await page.getByRole('region', { name: 'Detalle de productos' }).waitFor();
        const enlaces = page.locator('a[href="/admin/pedidos"]');
        await (width === 390 ? enlaces.last() : enlaces.first()).click();
        await page.getByRole('button', { name: 'HISTORIAL', exact: true }).click();
        await page.getByPlaceholder('Buscar por cliente o consecutivo').fill(pedido.numero);
        const fila = page.locator('.lista-pedidos button').filter({ hasText: pedido.numero });
        await fila.waitFor();
        await fila.click();
        const productos = page.getByRole('region', { name: 'Detalle de productos' });
        await productos.waitFor();
        assert.equal(await productos.locator('li').count(), pedido.lineas.length);
        for (const linea of pedido.lineas) assert.ok((await productos.innerText()).includes(linea.nombre));
        assert.deepEqual(errores, [], 'El cambio entre factura e historial no rompe el detalle');
        // Recorrido inverso: detalle cacheado -> factura, conservando el mismo formato.
        await page.evaluate(id => { history.pushState({ usr: { pedidoId: id }, key: 'factura-regreso', idx: 1 }, '', '/admin/ventas/completado'); dispatchEvent(new PopStateEvent('popstate')); }, pedido.id);
        await productos.waitFor();
        assert.equal(await productos.locator('li').count(), pedido.lineas.length);
        assert.deepEqual(errores, []);
        // Una lectura fallida debe permitir volver/reintentar, sin una pantalla en blanco.
        await page.goto(base + '/admin/pedidos');
        await page.getByRole('button', { name: 'HISTORIAL', exact: true }).click();
        await page.route('**/api/v1/pedidos/' + pedido.id, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lectura interrumpida en QA' }) }));
        await page.getByPlaceholder('Buscar por cliente o consecutivo').fill(pedido.numero);
        await fila.waitFor(); await fila.click();
        await page.getByRole('alert').filter({ hasText: 'Tus datos siguen guardados' }).waitFor();
        await page.unroute('**/api/v1/pedidos/' + pedido.id);
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await productos.waitFor();
        assert.equal(await productos.locator('li').count(), pedido.lineas.length);
        assert.deepEqual(errores, []);
        console.log(`✓ ${width}px: factura, historial, detalle, regreso y recuperación de lectura`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
