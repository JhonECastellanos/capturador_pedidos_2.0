/* API/PostgreSQL/Chrome QA reales. Solo extracción del modelo y avisos del SO simulados. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { mkdir } = require('node:fs/promises');
const { chromium } = require('playwright');

async function main() {
  const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
  assert.equal(base, 'http://localhost:8180', 'Solo QA 8180');
  const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
  const usuarioBd = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
  const sql = consulta => execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuarioBd, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const api = async (ruta, metodo = 'GET', data, ctx = context) => {
      const res = await ctx.request.fetch(base + '/api/v1' + ruta, { method: metodo, data });
      const body = await res.json();
      assert.ok(res.ok(), `${metodo} ${ruta}: ${res.status()} ${body.message || ''}`); return body;
    };
    const entrar = async ctx => { await api('/auth/login', 'POST', { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD }, ctx); };
    await entrar(context);
    const marca = 'QA conversación ' + Date.now();
    const producto = (await api('/productos', 'POST', { nombre: marca, precioVenta: 100, costoActual: 40, stock: 20, unidad: 'unidad' })).data;
    const proveedor = (await api('/proveedores', 'POST', { nombre: marca + ' proveedor' })).data;
    const crearPedido = async () => (await api('/pedidos', 'POST', { metodo: 'efectivo', estadoInicial: 'pendiente', lineas: [{ productoId: producto.id, cantidad: 1 }] })).data;
    const totalAntes = (await api('/notificaciones')).meta.total;
    const pedido = await crearPedido();
    await api(`/pedidos/${pedido.id}/estado`, 'PATCH', { estado: 'en-preparacion' });
    const compra = (await api('/recepciones-compra', 'POST', { proveedorId: proveedor.id, descontarCaja: false, lineas: [{ productoId: producto.id, cantidad: 3, costoUnitario: 40 }] })).data;
    const avisos = await api('/notificaciones?pageSize=30');
    assert.equal(avisos.meta.total, totalAntes + 3);
    const n = avisos.data.find(n => n.titulo === 'Nuevo pedido ' + pedido.numero);
    const nc = avisos.data.find(n => n.ruta === '/admin/compras?recepcion=' + compra.id);
    assert.ok(n && nc); assert.equal(n.ruta, '/admin/ventas/pedido/' + pedido.id);
    const recientes = await api('/notificaciones?recientes=true');
    assert.equal(recientes.meta, undefined); assert.ok(recientes.data.length <= 30);
    const antesRollback = sql('SELECT count(*) FROM "notificaciones"');
    sql(`BEGIN; UPDATE "pedidos" SET estado='pendiente' WHERE id='${pedido.id}'; ROLLBACK;`);
    assert.equal(sql('SELECT count(*) FROM "notificaciones"'), antesRollback, 'Rollback no deja avisos');
    await api(`/notificaciones/${n.id}/leer`, 'POST', {}); await api(`/notificaciones/${n.id}/leer`, 'POST', {});
    assert.equal(sql(`SELECT count(*) FROM "lecturasNotificacion" WHERE "notificacionId"='${n.id}'`), '1');
    const detalle = (await api('/recepciones-compra/' + compra.id)).data;
    assert.equal(detalle.id, compra.id); assert.equal(detalle.lineas[0].cantidad, 3); assert.equal(detalle.total, 120);
    console.log('✓ Avisos persistidos por pedido, estado y compra; rollback limpio; lectura idempotente; recepción exacta con líneas y total.');

    for (const rol of ['administrador', 'vendedor', 'inventario']) {
      const email = randomUUID() + '@pruebas.invalid', password = 'SoloPruebas2026!';
      const usuario = (await api('/usuarios', 'POST', { nombre: marca + ' ' + rol, email, password, rol })).data;
      if (rol === 'administrador') await api('/usuarios/' + usuario.id + '/permisos', 'PATCH', { permisosDenegados: ['chat', 'notificaciones'] });
      const otro = await browser.newContext();
      try {
        await api('/auth/login', 'POST', { identifier: email, password }, otro);
        assert.equal((await otro.request.get(base + '/api/v1/notificaciones')).status(), 403);
        assert.equal((await otro.request.post(base + '/api/v1/agentes/chat', { data: { texto: 'Consulta stock' } })).status(), 403);
      } finally { await otro.close(); }
    }
    console.log('✓ API rechaza roles ajenos y permisos revocados sin llamar al proveedor.');

    await context.addInitScript(() => {
      window.__avisosSistema = [];
      Object.defineProperty(window, 'Notification', { value: class { static permission = 'granted'; static async requestPermission() { return 'granted'; } } });
      ServiceWorkerRegistration.prototype.showNotification = async function(t, o) { window.__avisosSistema.push({ titulo: t, ...o }); };
    });
    const page = await context.newPage(), errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.goto(base + '/admin/notificaciones');
    await page.getByRole('button', { name: 'Activar avisos y sonido', exact: true }).click();
    await page.getByText('Avisos con sonido habilitados', { exact: false }).waitFor();
    await page.getByRole('button', { name: new RegExp('Compra recibida ' + compra.numero) }).click();
    await page.waitForURL(base + '/admin/compras?recepcion=' + compra.id);
    await page.getByText('Líneas facturadas', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    assert.equal(new URL(page.url()).search, '', 'Volver retira el enlace al detalle');
    await page.getByRole('link', { name: 'Notificaciones', exact: true }).click();
    await page.getByRole('button', { name: 'Silenciar avisos y sonido', exact: true }).waitFor();
    const nuevo = await crearPedido();
    await page.getByRole('status', { name: 'Nuevo aviso' }).getByText('Nuevo pedido ' + nuevo.numero, { exact: true }).waitFor({ timeout: 12000 });
    await page.waitForFunction(numero => window.__avisosSistema.some(n => n.body === 'Nuevo pedido ' + numero), nuevo.numero);
    await page.getByRole('status', { name: 'Nuevo aviso' }).getByRole('link').click();
    await page.waitForURL(base + '/admin/ventas/pedido/' + nuevo.id);
    console.log('✓ Chrome móvil: aviso del navegador y toast, permiso por toque, enlace a compra/pedido y retorno correctos. Aviso del sistema simulado.');

    let ultimo;
    const instruccion = { operacion: 'pedido', ocasional: true, lineas: [{ producto: producto.nombre, cantidad: 2 }], metodo: 'efectivo', preparacion: 'pendiente' };
    const id = randomUUID();
    const revision = (await api('/agentes/revisar', 'POST', { id, version: 1, instruccion })).data;
    const corregido = (await api('/agentes/revisar', 'POST', { id, version: 2, instruccion: { ...instruccion, metodo: 'billetera', lineas: [{ producto: producto.nombre, cantidad: 3 }] } })).data;
    await context.route('**/agentes/chat', async r => {
      ultimo = r.request().postDataJSON();
      if (/consulta/i.test(ultimo.texto)) await r.fulfill({ json: { data: { respuesta: 'Encontré un registro.', resultados: [{ titulo: producto.nombre, detalle: 'Producto consultado en QA', ruta: '/admin/inventario' }] } } });
      else await r.fulfill({ json: { data: { respuesta: 'Listo. Revisa y confirma.', revision: /cambia/i.test(ultimo.texto) ? corregido : revision, resultados: [] } } });
    });
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    async function enviar(texto) { await page.getByRole('textbox', { name: 'Mensaje al chatbot' }).fill(texto); await page.getByRole('button', { name: 'Enviar', exact: true }).click(); await page.getByRole('button', { name: 'Enviar', exact: true }).waitFor(); await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(n => n.textContent === 'Revisando…')); }
    await enviar('Consulta stock de ' + producto.nombre);
    await page.getByRole('log').getByRole('link', { name: new RegExp(producto.nombre) }).waitFor();
    const pedidosAntesChat = (await api('/pedidos')).meta.total;
    await enviar('Prepara un pedido de dos ' + producto.nombre + ', efectivo, para preparar');
    await enviar('Cambia a tres y billetera');
    assert.equal(ultimo.anterior.lineas[0].cantidad, 2); assert.equal(ultimo.anterior.metodo, 'efectivo');
    assert.equal((await api('/pedidos')).meta.total, pedidosAntesChat, 'Chat no guarda antes de confirmar');
    await page.getByRole('button', { name: 'Abrir detalle para revisar y confirmar', exact: true }).click();
    await page.getByRole('button', { name: /Confirmar pedido/ }).waitFor();
    assert.equal((await api('/pedidos')).meta.total, pedidosAntesChat, 'Abrir formulario tampoco guarda');
    await page.getByRole('button', { name: /Confirmar pedido/ }).click();
    await page.waitForURL(base + '/admin');
    assert.equal((await api('/pedidos')).meta.total, pedidosAntesChat + 1, 'Solo la confirmación real guarda');
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Abrir detalle para revisar y confirmar', exact: true }).count(), 0, 'No vuelve a ofrecer un borrador ya guardado');
    await enviar('Prepara otro pedido');
    await enviar('cancelar');
    assert.equal(await page.getByRole('button', { name: 'Abrir detalle para revisar y confirmar', exact: true }).count(), 0, 'Cancelar retira el borrador');
    assert.equal((await api('/pedidos')).meta.total, pedidosAntesChat + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mkdir('.local/pruebas-ui', { recursive: true });
    await page.screenshot({ path: '.local/pruebas-ui/chat-movil.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '.local/pruebas-ui/chat-escritorio.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errores, []);
    console.log('✓ Chat móvil/escritorio: consulta, borrador, corrección, confirmación mediante formulario y una sola venta; no desbordamiento ni errores de ejecución.');
    await context.close();
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
