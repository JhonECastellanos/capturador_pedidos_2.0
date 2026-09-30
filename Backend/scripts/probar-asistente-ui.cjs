const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { entenderBasico, responderCampo } = require('../dist/asistente/intenciones');
const { ConfiguracionAsistenteEsquema } = require('@ambie/contrato');

async function main() {
  const raiz = resolve(__dirname, '../../Frontend/dist');
  const servidor = createServer(async (req, res) => {
    const ruta = resolve(raiz, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!ruta.startsWith(raiz)) { res.writeHead(403); res.end(); return; }
    const archivo = /\.(js|css|svg|png|ico|woff2)$/.test(ruta) ? ruta : resolve(raiz, 'index.html');
    try { const buffer = await readFile(archivo); res.setHeader('Content-Type', archivo.endsWith('.js') ? 'text/javascript' : archivo.endsWith('.css') ? 'text/css' : archivo.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(buffer); } catch { res.writeHead(404); res.end(); }
  }); servidor.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  const base = `http://localhost:${servidor.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const rol of ['vendedor', 'administrador']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
      const page = await context.newPage(); const errores = []; const pedidos = []; let guardados = 0, egresos = 0;
      page.on('pageerror', e => errores.push(e.message));
      await page.addInitScript(() => {
        const original = window.WebSocket;
        class VozPrueba {
          static OPEN = 1;
          readyState = 0; bufferedAmount = 0;
          constructor(url, protocolos) {
            if (!String(url).includes('/asistente/voz')) return new original(url, protocolos);
            window.__vozEnviar = evento => this.onmessage?.({ data: JSON.stringify(evento) });
            setTimeout(() => { this.readyState = 1; this.onmessage?.({ data: JSON.stringify({ tipo: 'lista' }) }); }, 50);
          }
          send(datos) { if (datos instanceof ArrayBuffer) window.__vozBytes = datos.byteLength; }
          close() { this.readyState = 3; }
        }
        window.WebSocket = VozPrueba;
      });
      await page.route('**/api/v1/**', async route => {
        const req = route.request(); const ruta = new URL(req.url()).pathname.replace('/api/v1', ''); const cuerpo = req.postDataJSON(); let data = [];
        const usuario = { id: 'ui-prueba', nombre: 'Prueba', rol, activo: true, email: 'prueba@invalid.test', permisos: [] };
        if (ruta === '/auth/me') data = usuario;
        else if (ruta === '/asistente/preferencias') data = { vozHabilitada: true, confirmacionVoz: true, responderConVoz: false };
        else if (ruta === '/asistente/configuracion') data = { ...ConfiguracionAsistenteEsquema.parse({}), tieneClave: false };
        else if (ruta === '/asistente/voz/sesion') data = { ticket: 'simulado' };
        else if (ruta === '/asistente/entender') data = cuerpo.pendiente && cuerpo.campo ? responderCampo(cuerpo.texto, cuerpo.pendiente, cuerpo.campo, rol) || entenderBasico(cuerpo.texto, rol, cuerpo.pendiente) : entenderBasico(cuerpo.texto, rol, cuerpo.pendiente);
        else if (ruta === '/productos') data = [{ id: 'choco', nombre: 'chocorramo', stock: 20, stockFisico: 20, stockReservado: 0, precioVenta: 2000, costoActual: 1000, categoria: 'Dulces', codigoInterno: 'CH', activo: true }];
        else if (ruta === '/usuarios') data = [usuario];
        else if (ruta === '/caja/egresos' && req.method() === 'POST') { assert.deepEqual(cuerpo, { concepto: 'Retiro de caja', monto: 5000, metodo: 'billetera' }); egresos++; data = { id: 'egreso-prueba' }; }
        else if (ruta === '/pedidos') {
          if (req.method() === 'POST') {
            guardados++; assert.equal(cuerpo.clienteId, null); assert.equal(cuerpo.metodo, 'efectivo');
            assert.deepEqual(cuerpo.lineas, [{ productoId: 'choco', cantidad: 2 }]);
            pedidos.push({ id: 'pedido-prueba', numero: 'PED-PRUEBA', ...cuerpo, subtotal: 4000, total: 4000, creadoEn: new Date().toISOString(), estado: 'entregado', pago: { metodo: cuerpo.metodo, montoRecibido: 4000, saldoPendiente: 0, estado: 'pagado' }, historialEstados: [] }); data = pedidos[0];
          } else data = pedidos;
        }
        await route.fulfill({ json: { data } });
      });
      await page.goto(`${base}/${rol === 'administrador' ? 'administracion' : 'vendedor'}`);
      const microfono = page.getByRole('button', { name: /Asistente de voz,/ }); await microfono.waitFor();
      const antes = await microfono.boundingBox();
      await page.mouse.move(antes.x + 26, antes.y + 26); await page.mouse.down(); await page.mouse.move(80, 130, { steps: 12 }); await page.mouse.up();
      const despues = await microfono.boundingBox(); assert.ok(Math.abs(despues.x - antes.x) > 20);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await microfono.getAttribute('aria-pressed'), 'false');
      await microfono.click();
      await page.getByText('Te escucho. Dime qué quieres hacer.', { exact: false }).waitFor();
      async function decir(texto, comprobar) {
        const respuesta = page.waitForResponse(r => r.url().includes('/asistente/entender') || r.request().method() === 'POST' && (r.url().endsWith('/pedidos') || r.url().endsWith('/caja/egresos')));
        await page.evaluate(texto => window.__vozEnviar({ tipo: 'final', texto, confianza: 1 }), texto);
        await respuesta;
        await page.waitForFunction(() => document.querySelector('[aria-label^="Asistente de voz,"]')?.getAttribute('aria-label')?.includes('escuchando'));
        try { await page.getByText(comprobar, { exact: false }).last().waitFor({ timeout: 5000 }); }
        catch (e) { console.error('Estado visual:', await page.locator('body').innerText()); throw e; }
      }
      await decir('voy a tomar un pedido', '¿Es para un cliente habitual');
      await decir('ocasional', '¿Qué productos necesita?');
      await decir('dos chocorramo', '¿Hay algo que preparar');
      await page.evaluate(() => window.__vozEnviar({ tipo: 'final', texto: 'quita chocorramo', confianza: 1 }));
      await page.getByRole('status').filter({ hasText: '¿Qué productos necesita?' }).waitFor();
      assert.equal(guardados, 0);
      await decir('un chocorramo', '¿Hay algo que preparar');
      await decir('agrega un chocorramo', '¿Hay algo que preparar');
      await decir('no', '¿Cuál es el método de pago?');
      await decir('crédito', '¿Cuál es el método de pago?'); assert.equal(guardados, 0);
      await decir('efectivo', 'Di confirmar operación');
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.match(page.url(), /pedido$/);
      assert.equal(await page.getByText('Crédito', { exact: true }).count(), 0);
      assert.ok(await page.getByRole('button', { name: /Confirmar pedido/ }).isVisible());
      await page.screenshot({ path: resolve('.ambie-config', `voz-${rol}-movil.png`) });
      await page.evaluate(() => window.__vozEnviar({ tipo: 'final', texto: 'sí', confianza: 1 })); await page.waitForTimeout(400); assert.equal(guardados, 0);
      await decir('confirmar operación', 'La operación quedó guardada'); assert.equal(guardados, 1);
      if (rol === 'administrador') {
        await decir('registrar egreso', '¿Cuál es el concepto?');
        assert.match(page.url(), /admin\/caja$/);
        await decir('Retiro de caja', '¿Cuál es el monto?');
        assert.equal(await page.getByLabel('Concepto', { exact: true }).inputValue(), 'Retiro de caja');
        await decir('cinco mil', '¿Cuál es el método de pago?');
        assert.equal(await page.getByLabel('Monto', { exact: true }).inputValue(), '5000');
        await decir('billetera', 'Di confirmar operación');
        assert.equal(await page.getByRole('combobox', { name: /Medio/ }).inputValue(), 'billetera');
        assert.equal(egresos, 0); assert.equal(await page.getByRole('dialog').count(), 0);
        await decir('confirmar operación', 'La operación quedó guardada'); assert.equal(egresos, 1);
      }
      await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(150);
      await page.screenshot({ path: resolve('.ambie-config', `voz-${rol}-escritorio.png`) });
      const escritorio = await microfono.boundingBox(); assert.ok(escritorio.x >= 0 && escritorio.x + escritorio.width <= 1440);
      await microfono.click(); assert.equal(await microfono.getAttribute('aria-pressed'), 'false'); assert.equal(await page.getByRole('dialog').count(), 0);
      assert.deepEqual(errores, []); console.log(`✓ ${rol}: arrastre, móvil, escritorio, conversación, crédito rechazado, confirmación y actualización visual`);
      await context.close();
    }
  } finally { await browser.close(); servidor.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
