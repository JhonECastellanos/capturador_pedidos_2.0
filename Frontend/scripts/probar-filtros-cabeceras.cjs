// Navegador real sobre frontend compilado en QA. Solo lee datos comerciales.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const base = 'http://127.0.0.1:8180';
const carpeta = '.local/pruebas-armonia';
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errores = [], casos = [];
  mkdirSync(carpeta, { recursive: true });
  try {
    for (const ancho of [320, 393, 768, 1440]) {
      const contexto = await browser.newContext({ viewport: { width: ancho, height: ancho < 768 ? 700 : 900 }, isMobile: ancho < 768, hasTouch: ancho < 1024 });
      const login = await contexto.request.post(base + '/api/v1/auth/login', { data: { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' } });
      assert.equal(login.status(), 200, 'Acceso QA');
      // La revisión de estilo no necesita llamadas a proveedores externos.
      await contexto.route('**/agentes/proveedores/*/modelos', r => r.fulfill({ json: { data: [] } }));
      const page = await contexto.newPage(); page.on('pageerror', e => errores.push(e.message));
      await page.goto(base + '/admin/pedidos');
      const segmentos = page.locator('.segmento-control');
      await segmentos.nth(2).waitFor();
      assert.equal(await segmentos.first().getByRole('button', { name: 'Hoy', exact: true }).count(), 1);
      assert.equal(await segmentos.first().getByRole('button', { name: 'Historial', exact: true }).count(), 1);
      const geometria = await segmentos.evaluateAll(es => es.map(e => ({ ancho: e.clientWidth, contenido: e.scrollWidth, overflow: getComputedStyle(e).overflowX, radio: getComputedStyle(e).borderRadius })));
      assert.ok(geometria.every(e => e.overflow === 'auto' && e.radio === '10px'));
      if (ancho < 768) assert.ok(geometria[2].contenido > geometria[2].ancho, 'Estados con scroll propio');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const [estado, etiqueta] of [['pendiente', 'Pendiente'], ['en-preparacion', 'En preparación'], ['entregado', 'Entregado'], ['cancelado', 'Cancelado'], ['todos', 'Todos']]) {
        const respuesta = estado === 'todos' ? null : page.waitForResponse(r => r.url().includes('/api/v1/pedidos?') && new URL(r.url()).searchParams.get('estado') === estado && r.status() === 200);
        await segmentos.nth(2).getByRole('button', { name: etiqueta, exact: true }).click();
        if (respuesta) { const data = (await (await respuesta).json()).data; assert.ok(data.every(p => p.estado === estado)); }
        assert.equal(await segmentos.nth(2).getByRole('button', { name: etiqueta, exact: true }).getAttribute('aria-pressed'), 'true');
      }
      await page.screenshot({ path: carpeta + '/pedidos-' + ancho + '.png' });
      casos.push('Pedidos ' + ancho + ': forma, mayúscula inicial, filtros reales y scroll horizontal contenido');
      for (const modulo of ['', 'creditos', 'inventario', 'compras', 'precios', 'caja', 'cierre', 'usuarios', 'auditoria', 'configuracion']) {
        await page.goto(base + '/admin/' + modulo);
        const ayuda = page.getByRole('button', { name: /^Ayuda de/ }).first(); await ayuda.waitFor();
        assert.ok(await page.locator('.titulo-modulo').evaluateAll(es => es.every(e => e.getBoundingClientRect().width <= 1)), modulo + ': título solo accesible');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, modulo + ': ancho');
        assert.ok(await page.locator('.cabecera-modulo').evaluateAll(es => es.every(e => getComputedStyle(e).position === 'static')));
        if (modulo === 'creditos') {
          await page.getByText(/por cobrar$/).waitFor();
          const importe = await page.getByText(/por cobrar$/).innerText();
          if (ancho === 393) await page.screenshot({ path: carpeta + '/creditos-pendientes-393.png' });
          await page.getByRole('button', { name: 'Historial', exact: true }).click();
          assert.equal(await page.getByText(/por cobrar$/).innerText(), importe);
          await page.setViewportSize({ width: ancho, height: 350 });
          const antes = await ayuda.boundingBox();
          await page.locator('.admin-contenido').evaluate(e => { e.scrollTop = 280; });
          const despues = await ayuda.boundingBox();
          assert.ok(despues.y < antes.y - 40, 'La ayuda se desplaza con el contenido');
          if (ancho < 1024) assert.ok((await page.locator('.admin-cuerpo > header').boundingBox()).y >= -1, 'Menú principal accesible');
          await page.locator('.admin-contenido').evaluate(e => { e.scrollTop = 0; });
          await page.setViewportSize({ width: ancho, height: ancho < 768 ? 700 : 900 });
          await page.screenshot({ path: carpeta + '/creditos-' + ancho + '.png' });
        }
        await ayuda.click(); await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: 'Cerrar guía', exact: true }).click();
        if (modulo === 'inventario') {
          await page.getByText('Stock general', { exact: true }).first().click();
          await page.getByRole('button', { name: '+ Producto', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Ayuda de Inventario', exact: true }).waitFor();
          await page.getByRole('button', { name: '+ Producto', exact: true }).click();
          await page.getByRole('button', { name: 'Escanear código', exact: true }).waitFor();
          await page.getByLabel('Nombre del producto', { exact: true }).waitFor();
        }
      }
      casos.push('Diez módulos ' + ancho + ': ayuda, título sin redundancia, navegación y total de crédito conservados');
      await contexto.request.post(base + '/api/v1/auth/logout', { data: {} }); await contexto.close();
    }
    assert.deepEqual(errores, []);
    writeFileSync(carpeta + '/resultados.json', JSON.stringify({ fecha: new Date().toISOString(), casos, errores, escriturasComerciales: 0 }, null, 2));
    for (const caso of casos) console.log('✓ ' + caso);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
