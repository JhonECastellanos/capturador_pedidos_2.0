/* Chrome real sobre Docker QA; transporte de voz/modelo simulado y revisión API real. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
async function main() {
  const base = 'http://localhost:8180';
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const login = await context.request.post(base + '/api/v1/auth/login', { data: { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD } });
    assert.equal(login.status(), 200);
    const antes = (await (await context.request.get(base + '/api/v1/pedidos')).json()).meta.total;
    const producto = (await (await context.request.get(base + '/api/v1/productos?pageSize=200&activo=true')).json()).data.find(p => p.stock >= 3);
    assert.ok(producto && producto.stock >= 3);
    const instruccion = { operacion: 'pedido', ocasional: true, lineas: [{ producto: producto.nombre, cantidad: 2 }], metodo: 'efectivo', preparacion: 'pendiente' };
    async function revisar(i, version) {
      const r = await context.request.post(base + '/api/v1/agentes/revisar', { data: { id, version, instruccion: i } });
      assert.equal(r.status(), 201); return (await r.json()).data;
    }
    const id = randomUUID(), original = await revisar(instruccion, 1), correccion = await revisar({ ...instruccion, metodo: 'billetera', lineas: [{ producto: producto.nombre, cantidad: 3 }] }, 2);
    const audio = { idioma: 'es', velocidad: 1, volumen: 1, voz: '', stt: 'whisper', modeloStt: 'base' };
    await context.route('**/agentes/estado', r => r.fulfill({ json: { data: { habilitado: true, configurado: true, modo: 'hibrido', audio } } }));
    await context.route('**/agentes/audio/sesion', r => r.fulfill({ json: { data: { ticket: 'qa-controlado' } } }));
    let socket, conexiones = 0, llamadas = 0;
    await context.routeWebSocket('**/agentes/audio/conversar?*', ws => { socket = ws; conexiones++; setTimeout(() => ws.send(JSON.stringify({ tipo: 'listo' })), 20); ws.onMessage(() => {}); });
    const ordenes = [];
    await context.route('**/agentes/interpretar', async r => {
      llamadas++; ordenes.push(r.request().postDataJSON());
      if (llamadas === 1) await r.fulfill({ status: 422, json: { message: 'El proveedor rechazó esta solicitud de prueba' } });
      else { await new Promise(resolve => setTimeout(resolve, 250)); await r.fulfill({ json: { data: llamadas === 2 ? original : correccion } }); }
    });
    await context.addInitScript(() => {
      window.__locuciones = [];
      Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, getVoices: () => [], cancel() {}, speak(m) { window.__locuciones.push(m.text); m.onstart?.(); setTimeout(() => m.onend?.(), 10); } } });
    });
    const page = await context.newPage(), errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.goto(base + '/admin/productos');
    const robot = page.getByRole('button', { name: 'Asistente', exact: true });
    await robot.click(); await page.waitForFunction(() => document.querySelector('.robot-asistente')?.getAttribute('aria-pressed') === 'true');
    socket.send(JSON.stringify({ tipo: 'instruccion', texto: 'Hola buenas tardes' }));
    await page.waitForFunction(() => window.__locuciones.includes('Hola, buenas tardes.'));
    assert.equal(llamadas, 0, 'El saludo no llama al proveedor');
    socket.send(JSON.stringify({ tipo: 'instruccion', texto: 'Pedido de prueba' }));
    await page.getByRole('status').filter({ hasText: 'rechazó' }).waitFor();
    assert.equal(await robot.getAttribute('aria-pressed'), 'true', 'Un rechazo no apaga el micrófono');
    socket.send(JSON.stringify({ tipo: 'instruccion', texto: `Cliente ocasional, dos ${producto.nombre}, efectivo, para preparar` }));
    await page.getByRole('button', { name: /Confirmar pedido/ }).waitFor();
    await page.waitForFunction(() => window.__locuciones.includes('Listo. Revisa y confirma.'));
    socket.send(JSON.stringify({ tipo: 'instruccion', texto: `Deja tres ${producto.nombre} y paga con billetera` }));
    await page.waitForFunction(() => window.__locuciones.filter(t => t === 'Listo. Revisa y confirma.').length === 2);
    assert.equal(ordenes[2].anterior.lineas[0].cantidad, 2);
    assert.equal(ordenes[2].anterior.metodo, 'efectivo');
    await page.locator('body').dispatchEvent('pointerdown');
    assert.equal(await robot.getAttribute('aria-expanded'), 'false');
    assert.equal(await robot.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(350); await robot.click();
    assert.equal(await robot.getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(350); await robot.click();
    assert.equal(await robot.getAttribute('aria-pressed'), 'true');
    assert.equal(conexiones, 1, 'Reactivar conserva la conexión');
    await page.waitForTimeout(350); await robot.dblclick({ delay: 80 });
    assert.equal(await robot.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errores, []);
    assert.equal((await (await context.request.get(base + '/api/v1/pedidos')).json()).meta.total, antes);
    console.log('Chrome QA: saludo breve sin proveedor; rechazo conserva escucha; detalle y corrección conservan borrador; tocar fuera, mutear, reactivar y apagar funcionan. Ningún pedido guardado. Audio y modelo simulados; revisión con API/PostgreSQL reales.');
    await context.close();
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
