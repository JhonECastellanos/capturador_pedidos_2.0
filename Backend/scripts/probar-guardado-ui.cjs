const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const base = 'http://localhost:8180';

async function main() {
  mkdirSync('.local/pruebas-ui', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errores = [], intentos = [];
  page.on('pageerror', e => errores.push(e.message));
  try {
    const login = await context.request.post(base + '/api/v1/auth/login', { data: { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' } });
    assert.equal(login.status(), 200);
    await context.storageState({ path: '.local/pruebas-ui/qa-v4p2-sesion.json' });
    await page.goto(base + '/admin');
    const tarjetas = page.getByRole('region', { name: 'Resumen del mes' });
    await tarjetas.waitFor();
    const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const resumen = (await (await context.request.get(base + `/api/v1/dashboard/resumen?desde=${mes.slice(0, 7)}-01&hasta=${mes}`)).json()).data;
    const moneda = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
    for (const [etiqueta, valor] of [['Ventas del mes', resumen.ventas], ['Gastos del mes', resumen.gastos], ['Compras del mes', resumen.compras], ['Compras y gastos del mes', resumen.compras + resumen.gastos], ['Ticket promedio del mes', resumen.ticketPromedio]]) assert.ok((await tarjetas.getByText(etiqueta, { exact: true }).locator('..').innerText()).includes(moneda(valor)), etiqueta);
    await page.screenshot({ path: '.local/pruebas-ui/inicio-v4p2.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.local/pruebas-ui/inicio-movil-v4p2.png' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Tarjetas mensuales sin desborde móvil');
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.locator('[role=tooltip]:visible').count(), 0);
    await page.getByRole('button', { name: /: ventas / }).last().hover();
    await page.locator('[role=tooltip]:visible').waitFor();
    assert.match(await page.locator('[role=tooltip]:visible').innerText(), /Ventas:.*\nCompras y gastos:/);
    await page.mouse.move(0, 0); assert.equal(await page.locator('[role=tooltip]:visible').count(), 0);
    const punto = page.getByRole('button', { name: /: rentabilidad / }).last();
    await punto.hover(); await page.locator('[role=tooltip]:visible').waitFor();
    assert.match(await page.locator('[role=tooltip]:visible').innerText(), /Rentabilidad:/);
    await page.screenshot({ path: '.local/pruebas-ui/graficos-v4p2.png', fullPage: true });
    await page.mouse.move(0, 0); assert.equal(await page.locator('[role=tooltip]:visible').count(), 0);
    await punto.focus(); assert.equal(await page.locator('[role=tooltip]:visible').count(), 1);
    await page.goto(base + '/admin/inventario');
    await page.getByRole('button', { name: /Inventario inicial/ }).click();
    await page.getByText('El punto de partida del negocio', { exact: true }).waitFor();
    await page.getByText('El stock coincide con el inicio y los movimientos registrados.', { exact: true }).waitFor();
    await page.getByPlaceholder('Buscar producto del inventario inicial').fill('ningun-producto-coincide');
    await page.getByText('No hay productos que coincidan con la búsqueda.', { exact: true }).waitFor();
    await page.getByPlaceholder('Buscar producto del inventario inicial').fill('');
    await page.getByRole('button', { name: 'Siguiente →', exact: true }).click();
    await page.getByText(/Página 2 de/).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.local/pruebas-ui/inventario-inicial-movil-v4p2.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Sin desborde horizontal móvil');

    const nombre = `Respuesta perdida ${Date.now()}`;
    await page.route('**/api/v1/productos', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const respuesta = await route.fetch();
      assert.equal(respuesta.status(), 201);
      const datos = (await respuesta.json()).data;
      intentos.push({ clave: route.request().headers()['idempotency-key'], id: datos.id });
      if (intentos.length === 1) return route.abort('connectionfailed');
      return route.fulfill({ response: respuesta });
    });
    async function formulario() {
      await page.goto(base + '/admin/inventario');
      await page.getByRole('button', { name: /Stock general/ }).click();
      await page.getByRole('button', { name: '+ Producto', exact: true }).click();
      await page.getByPlaceholder('Nombre del producto', { exact: true }).fill(nombre);
      await page.getByPlaceholder('Precio venta ($)', { exact: true }).fill('1500');
      await page.getByPlaceholder('Costo compra ($)', { exact: true }).fill('500');
      await page.getByPlaceholder('Stock inicial', { exact: true }).fill('5');
    }
    await formulario();
    await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
    await page.getByText('No se pudo conectar. Revisa tu conexión e intenta de nuevo.', { exact: true }).waitFor();
    assert.equal(intentos.length, 1);
    // La respuesta fue cortada después del commit; recargar pierde el formulario,
    // pero conserva la huella/UUID en la misma pestaña segura localhost.
    await page.reload();
    await formulario();
    await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
    await page.getByText(`Producto ${nombre} creado`, { exact: true }).waitFor();
    assert.equal(intentos.length, 2);
    assert.deepEqual(intentos[1], intentos[0], 'El reintento después de recargar confirma el mismo producto');
    const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
    const usuario = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
    const sql = consulta => execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuario, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim();
    assert.equal(sql(`SELECT count(*) FROM productos WHERE nombre='${nombre}';`), '1');
    assert.equal(sql(`SELECT count(*) FROM "movimientosInventario" WHERE "productoId"='${intentos[0].id}';`), '1');
    assert.match(mes, /^\d{4}-\d{2}-\d{2}$/);
    const mensualSql = JSON.parse(sql(`WITH v AS (SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS cantidad FROM pedidos WHERE estado<>'cancelado' AND "fechaOperacion" BETWEEN '${mes.slice(0,7)}-01' AND '${mes}'), g AS (SELECT COALESCE(SUM(monto),0) AS total FROM gastos WHERE "fechaOperacion" BETWEEN '${mes.slice(0,7)}-01' AND '${mes}'), r AS (SELECT COALESCE(SUM(total),0) AS total FROM "recepcionesCompra" WHERE "fechaOperacion" BETWEEN '${mes.slice(0,7)}-01' AND '${mes}') SELECT json_build_object('ventas',v.total,'gastos',g.total,'compras',r.total,'ticketPromedio',CASE WHEN v.cantidad=0 THEN 0 ELSE ROUND(v.total/v.cantidad,2) END) FROM v,g,r;`));
    for (const campo of ['ventas','gastos','compras','ticketPromedio']) assert.equal(mensualSql[campo], resumen[campo], `Tarjeta/API/PostgreSQL: ${campo}`);
    assert.deepEqual(errores, []);
    const informe = { fecha: new Date().toISOString(), base, tarjetasMensuales: 5, conciliacionMensual: 'Los valores coinciden entre tarjetas, API y PostgreSQL', graficos: 'Etiquetas ocultas al salir del mouse y visibles con hover/foco', inventario: 'Búsqueda, segunda página y móvil sin desborde', respuestaPerdida: 'Corte después del commit, recarga y mismo UUID/producto al volver a confirmar', productoId: intentos[0].id, errores };
    writeFileSync('.local/pruebas-ui/guardado-v4p2.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify(informe, null, 2));
  } finally { await context.close(); await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
