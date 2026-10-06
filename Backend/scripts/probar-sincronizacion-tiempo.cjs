const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { performance } = require('node:perf_hooks');
async function main() {
  const base = 'http://localhost:8180';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const lector = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const escritor = await browser.newContext();
    for (const contexto of [lector, escritor]) {
      const entrada = await contexto.request.post(base + '/api/v1/auth/login', { data: { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' } });
      assert.equal(entrada.status(), 200);
    }
    const page = await lector.newPage();
    await page.goto(base + '/admin/inventario');
    await page.locator('.admin-pantalla').waitFor();
    await page.getByRole('button', { name: /Stock general/ }).click();
    const muestras = [];
    for (let i = 0; i < 10; i++) {
      const nombre = `Sincronización ${Date.now()} ${i}`;
      const buscador = page.getByPlaceholder(/Buscar/).first();
      await buscador.fill(nombre);
      await page.waitForTimeout(500);
      const inicio = performance.now();
      const respuesta = await escritor.request.post(base + '/api/v1/productos', { data: { nombre, precioVenta: 2000, costoActual: 800, stock: 5 } });
      assert.equal(respuesta.status(), 201);
      const confirmado = performance.now();
      await page.getByText(nombre, { exact: true }).first().waitFor({ timeout: 15000 });
      const visible = performance.now();
      muestras.push({ escrituraMs: +(confirmado - inicio).toFixed(2), respuestaAPantallaMs: +(visible - confirmado).toFixed(2), totalMs: +(visible - inicio).toFixed(2) });
    }
    const resumen = campo => { const valores = muestras.map(m => m[campo]).sort((a, b) => a - b); return { minimo: valores[0], mediana: valores[4], p95: valores[9], maximo: valores[9] }; };
    const informe = { fecha: new Date().toISOString(), base, cantidad: muestras.length, escrituraMs: resumen('escrituraMs'), respuestaAPantallaMs: resumen('respuestaAPantallaMs'), totalMs: resumen('totalMs'), alcance: 'Escritura desde otra sesión y aparición en Inventario mediante sincronización normal; sin pulsar actualizar ni emitir eventos manuales.', muestras };
    mkdirSync('.local/pruebas-persistencia', { recursive: true });
    writeFileSync('.local/pruebas-persistencia/sincronizacion.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify({ ...informe, muestras: undefined }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
