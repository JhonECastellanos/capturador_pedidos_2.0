// Chrome con transporte controlado; no usa credenciales ni datos del negocio.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { resolve } = require('node:path');

async function main() {
  const { createServer } = await import('vite');
  const servidor = await createServer({ root: resolve('Frontend'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await servidor.listen();
  const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  const resultados = [];
  try {
    for (const caso of ['anticipada', 'respuestas-tardias', 'revocada', 'sin-red', 'cancelada', 'guardado']) {
      const contexto = await navegador.newContext();
      const pagina = await contexto.newPage();
      let renovaciones = 0, archivos = 0, operaciones = 0;
      const claves = [];
      await pagina.route(base + '/', r => r.fulfill({ contentType: 'text/html', body: '<html><body>Comprobación de sesión</body></html>' }));
      await pagina.route('**/api/v1/**', async r => {
        const ruta = new URL(r.request().url()).pathname;
        if (ruta.endsWith('/auth/login')) return r.fulfill({ json: { data: { expiraEn: new Date(Date.now() + (['anticipada', 'sin-red'].includes(caso) ? 1000 : 900000)).toISOString() } } });
        if (ruta.endsWith('/auth/refresh')) {
          renovaciones++;
          if (caso === 'sin-red' && renovaciones === 1) return r.abort('failed');
          await new Promise(resolve => setTimeout(resolve, 50));
          return r.fulfill({ status: caso === 'revocada' ? 401 : 200, json: { data: { expiraEn: new Date(Date.now() + 900000).toISOString() } } });
        }
        if (ruta.endsWith('/archivos')) {
          archivos++;
          if (['respuestas-tardias', 'revocada', 'cancelada'].includes(caso) && archivos <= (caso === 'respuestas-tardias' ? 2 : 1)) {
            await new Promise(resolve => setTimeout(resolve, archivos === 2 ? 180 : 20));
            return r.fulfill({ status: 401, json: { message: 'Sesión no válida' } });
          }
        }
        if (ruta.endsWith('/pedidos')) {
          claves.push(r.request().headers()['idempotency-key']); operaciones++;
          if (operaciones === 1) return r.fulfill({ status: 401, json: { message: 'Sesión no válida' } });
        }
        return r.fulfill({ json: { data: [] } });
      });
      try {
        await pagina.goto(base);
        await pagina.evaluate(async () => {
          window.transporte = await import('/src/data/api.ts');
          window.expiraciones = 0;
          addEventListener('ambie:sesion-expirada', () => window.expiraciones++);
          await window.transporte.respuestaRed('/auth/login', 'POST', {});
        });
        if (caso === 'anticipada' || caso === 'respuestas-tardias') {
          await pagina.evaluate(() => Promise.all([window.transporte.respuestaRed('/archivos'), window.transporte.respuestaRed('/archivos')]));
          assert.equal(renovaciones, 1, 'Una renovación compartida, incluso con 401 tardío');
          assert.equal(archivos, caso === 'anticipada' ? 2 : 4);
        } else if (caso === 'revocada') {
          await pagina.evaluate(async () => {
            for (let i = 0; i < 3; i++) await window.transporte.respuestaRed('/archivos').catch(() => {});
          });
          assert.equal(archivos, 1); assert.equal(renovaciones, 1);
          assert.equal(await pagina.evaluate(() => window.expiraciones), 1);
          await pagina.evaluate(async () => {
            await window.transporte.respuestaRed('/auth/login', 'POST', {});
            await window.transporte.respuestaRed('/archivos');
          });
          assert.equal(archivos, 2, 'Un nuevo ingreso permite consultar nuevamente');
        } else if (caso === 'sin-red') {
          await pagina.evaluate(async () => {
            await window.transporte.respuestaRed('/archivos').catch(() => {});
            await window.transporte.respuestaRed('/archivos');
          });
          assert.equal(renovaciones, 2); assert.equal(archivos, 1);
          assert.equal(await pagina.evaluate(() => window.expiraciones), 0, 'La caída de red no cierra la sesión');
        } else if (caso === 'cancelada') {
          await pagina.evaluate(async () => {
            const controlador = new AbortController();
            const lectura = window.transporte.respuestaRed('/archivos', 'GET', undefined, controlador.signal).catch(() => {});
            setTimeout(() => controlador.abort(), 5);
            await lectura;
          });
          assert.equal(renovaciones, 0); assert.equal(archivos, 1);
        } else {
          await pagina.evaluate(() => window.transporte.respuestaRed('/pedidos', 'POST', { clienteId: 'cliente-ficticio' }));
          assert.equal(renovaciones, 1); assert.equal(operaciones, 2);
          assert.ok(claves[0]); assert.equal(claves[0], claves[1], 'El reintento conserva la clave para evitar duplicados');
        }
        resultados.push(caso);
      } finally { await contexto.close(); }
    }
    console.log(JSON.stringify({ aprobados: resultados.length, casos: resultados }));
  } finally { await navegador.close(); await servidor.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
