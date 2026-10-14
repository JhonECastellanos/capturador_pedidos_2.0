/* Mediciones de laboratorio repetibles en Docker QA; no confirma operaciones. */
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');

async function main() {
  const etiqueta = process.argv[2] || 'actual';
  assert.match(etiqueta, /^[a-z0-9-]+$/);
  const base = 'http://localhost:8180';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const resultados = { condiciones: { base, navegador: browser.version(), viewport: '390x844', cpu: 'sin limitación', red: 'local, sin limitación', cache: 'contexto nuevo en cada recorrido', evidencia: 'laboratorio; sin datos de usuarios reales' }, cargas: [], revisiones: [] };
  try {
    for (let intento = 0; intento < 3; intento++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.tracing.start({ screenshots: false, snapshots: true });
      const login = await context.request.post(base + '/api/v1/auth/login', { data: { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD } });
      assert.equal(login.status(), 200, 'Inicio de sesión normal en QA');
      const page = await context.newPage();
      const errores = [], busquedas = [];
      page.on('pageerror', e => errores.push(e.message));
      page.on('request', r => { if (r.url().includes('/productos?') && new URL(r.url()).searchParams.get('q')) busquedas.push(new URL(r.url()).searchParams.get('q')); });
      const inicio = performance.now();
      await page.goto(base + '/admin/productos');
      const input = page.getByPlaceholder('Buscar por nombre, código o categoría');
      await input.waitFor();
      await page.locator('.admin-pantalla .lista-datos button').first().waitFor();
      const listo = performance.now() - inicio;
      await page.waitForTimeout(200);
      const recursos = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /\/assets\/.*\.(js|css)/.test(r.name)).map(r => ({ archivo: r.name.split('/').pop(), transferido: r.encodedBodySize, original: r.decodedBodySize })));
      busquedas.length = 0;
      await input.pressSequentially('Pepsi', { delay: 60 });
      await page.waitForTimeout(600);
      assert.deepEqual(errores, []);
      resultados.cargas.push({ listoMs: Math.round(listo), bytesTexto: recursos.reduce((s, r) => s + r.transferido, 0), recursos, solicitudesAlEscribirPepsi: busquedas.length, filtrosSolicitados: [...busquedas] });
      const productos = (await (await context.request.get(base + '/api/v1/productos?pageSize=200&activo=true')).json()).data.filter(p => p.stock > 1).slice(0, 5);
      assert.equal(productos.length, 5, 'Cinco productos disponibles en QA');
      for (const cantidad of [1, 5]) {
        const instruccion = { operacion: 'pedido', ocasional: true, lineas: productos.slice(0, cantidad).map(p => ({ producto: p.nombre, cantidad: 1 })), metodo: 'billetera', preparacion: 'pendiente' };
        const desde = performance.now();
        const r = await context.request.post(base + '/api/v1/agentes/revisar', { data: { instruccion, id: randomUUID(), version: 1 } });
        assert.equal(r.status(), 201, 'Revisión de borrador');
        const revision = (await r.json()).data;
        assert.deepEqual(revision.faltantes, []);
        assert.equal(revision.datos.lineas.length, cantidad);
        resultados.revisiones.push({ lineas: cantidad, ms: Math.round(performance.now() - desde) });
      }
      await mkdir(resolve('.local/rendimiento'), { recursive: true });
      await context.tracing.stop({ path: resolve('.local/rendimiento', `${etiqueta}-${intento}.zip`) });
      await context.close();
    }
    await writeFile(resolve('.local/rendimiento', `${etiqueta}.json`), JSON.stringify(resultados, null, 2));
    console.log(JSON.stringify({ condiciones: resultados.condiciones, cargas: resultados.cargas.map(({ recursos, ...r }) => r), revisiones: resultados.revisiones }, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
