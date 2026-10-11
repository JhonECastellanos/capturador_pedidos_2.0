// API, PostgreSQL y navegador reales en QA. Nunca escribe sobre el negocio.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { APARIENCIA_INICIAL } = require('@synchronic-jo/contrato');
const base = 'http://127.0.0.1:8180/api/v1';
const casos = []; const etiqueta = Date.now();
const url = new URL('postgresql://127.0.0.1:5433/ambie_test');
url.username = process.env.POSTGRES_USER || 'ambie'; url.password = process.env.POSTGRES_PASSWORD;
const db = new PrismaClient({ datasourceUrl: url.href });
const clave = 'SoloPruebas2026!';
async function pedir(token, ruta, metodo = 'GET', datos, status = metodo === 'POST' ? 201 : 200) {
  const r = await fetch(base + ruta, { method: metodo, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }), ...(metodo === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }) }, body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(30000) });
  const j = await r.json(); assert.equal(r.status, status, `${metodo} ${ruta}: ${r.status} ${j.message || ''}`); return j.data;
}
async function ingreso(identifier, password = clave) { return pedir(null, '/auth/login', 'POST', { identifier, password }, 200); }
async function main() {
  mkdirSync('.local/pruebas-v8', { recursive: true });
  let navegador, servidor, original, admin;
  try {
    admin = (await ingreso('qa-admin@pruebas.invalid')).accessToken;
    const system = await ingreso('system@ambie.local', process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD);
    assert.equal(system.usuario.esSistema, true); assert.equal(system.usuario.nombre, 'system');
    await pedir(null, '/auth/login', 'POST', { identifier: 'system@ambie.local', password: 'UnaClaveIncorrecta2026!' }, 401);
    await pedir(admin, '/usuarios', 'POST', { nombre: 'Duplicado inválido', email: 'SYSTEM@AMBIE.LOCAL', password: clave, rol: 'inventario' }, 409);
    casos.push('system por correo; colisión histórica resuelta y duplicados rechazados');
    const contador = await pedir(admin, '/usuarios', 'POST', { nombre: 'Contador V8 ' + etiqueta, email: `contador-v8-${etiqueta}@pruebas.invalid`, password: clave, rol: 'inventario' });
    const vendedor = await pedir(admin, '/usuarios', 'POST', { nombre: 'Vendedor V8 ' + etiqueta, email: `vendedor-v8-${etiqueta}@pruebas.invalid`, password: clave, rol: 'vendedor' });
    let inv = (await ingreso(contador.email)).accessToken;
    let vend = (await ingreso(vendedor.email)).accessToken;
    for (const ruta of ['/usuarios', '/inventario/conteos', '/dashboard/resumen']) await pedir(inv, ruta, 'GET', undefined, 403);
    await pedir(vend, '/usuarios', 'GET', undefined, 403);
    casos.push('roles restringidos en API');
    original = await pedir(null, '/apariencia');
    const tema = { ...APARIENCIA_INICIAL, acento: '#2563eb', encabezado: '#152b4b', textoEncabezado: '#ffffff', fuente: 'serif', portada: 'oficina' };
    await pedir(admin, '/apariencia', 'PUT', tema);
    assert.deepEqual((await db.configuracionVisual.findUnique({ where: { id: 'principal' } })).configuracion, tema);
    await pedir(vend, '/apariencia', 'PUT', tema, 403);
    await pedir(admin, '/apariencia', 'PUT', { ...tema, texto: '#ffffff' }, 400);
    await pedir(admin, '/apariencia', 'PUT', { ...tema, imagen: 'data:image/png;base64,aG9sYQ==' }, 400);
    assert.deepEqual(await pedir(null, '/apariencia'), tema);
    casos.push('apariencia persistida, pública sin datos privados y cambio exclusivo de administrador');
    casos.push('contraste e imágenes inválidas rechazados sin alterar configuración');
    const productos = await pedir(admin, '/productos?pageSize=5'); const producto = productos[0]; assert.ok(producto);
    const conteo = await pedir(admin, '/inventario/conteos', 'POST', { tipo: 'general', turno: 'QA V8 ' + etiqueta });
    await pedir(inv, `/inventario/compartidos/${conteo.id}/asignar`, 'POST', { productoId: producto.id });
    await pedir(inv, `/inventario/conteos/${conteo.id}/lineas/${producto.id}?resumen=true`, 'PATCH', { stockFisico: 3 });
    const linea = await db.conteoLinea.findUnique({ where: { conteoId_productoId: { conteoId: conteo.id, productoId: producto.id } } });
    assert.equal(linea.contadoPorId, contador.id); assert.equal(linea.stockFisico, 3);
    await pedir(admin, `/usuarios/${contador.id}`, 'DELETE');
    const retirado = await db.usuario.findUnique({ where: { id: contador.id } });
    assert.equal(retirado.activo, false); assert.ok(retirado.eliminadoEn); assert.equal(retirado.nombre, contador.nombre);
    await pedir(inv, `/inventario/compartidos/${conteo.id}/lineas`, 'GET', undefined, 401);
    const historico = await db.conteoLinea.findUnique({ where: { id: linea.id }, include: { contadoPor: true } });
    assert.equal(historico.contadoPor.nombre, contador.nombre); assert.equal(historico.stockFisico, 3);
    const detalle = await pedir(admin, `/inventario/compartidos/${conteo.id}/lineas?q=${encodeURIComponent(producto.nombre)}&pageSize=30`);
    assert.equal(detalle.find(l => l.productoId === producto.id).contadoPor, contador.nombre);
    casos.push('retirar contador conserva cantidades, responsable y fecha; revoca acceso');
    await pedir(admin, `/usuarios/${system.usuario.id}`, 'DELETE', undefined, 409);
    await pedir(admin, `/usuarios/${system.usuario.id}/permisos`, 'PATCH', { permisosDenegados: ['usuarios'] }, 409);
    casos.push('system protegido contra retiro y restricciones');
    await pedir(admin, `/usuarios/${vendedor.id}/permisos`, 'PATCH', { permisosDenegados: ['pedidos', 'inventario'] });
    await pedir(vend, '/pedidos', 'GET', undefined, 401);
    vend = (await ingreso(vendedor.email)).accessToken;
    await pedir(vend, '/pedidos', 'GET', undefined, 403);
    await pedir(vend, '/inventario/compartidos?tipo=aleatorio', 'GET', undefined, 403);
    await pedir(vend, '/clientes?pageSize=5');
    casos.push('permiso retirado bloquea API y cierra sesiones; conserva los demás accesos');
    await pedir(admin, `/usuarios/${vendedor.id}/permisos`, 'PATCH', { permisosDenegados: [] });
    navegador = await chromium.launch({ channel: 'chrome', headless: true });
    for (const [width, height] of [[390,844], [768,1024], [1440,900], [320,320]]) {
      const contexto = await navegador.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 1024 });
      const page = await contexto.newPage(); const errores = [];
      page.on('pageerror', e => errores.push(e.message));
      try {
        await page.goto('http://127.0.0.1:8180');
        await page.getByRole('heading', { name: 'Iniciar sesión' }).waitFor();
        assert.ok((await page.title()).includes('Synchronic.JO'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.ok(await page.getByRole('button', { name: 'Ingresar', exact: true }).count());
        if (width === 320) { await page.getByRole('button', { name: 'Ingresar', exact: true }).scrollIntoViewIfNeeded(); assert.equal(await page.getByRole('button', { name: 'Ingresar', exact: true }).isVisible(), true); }
        else {
          await page.getByLabel('Usuario o correo').fill('qa-admin@pruebas.invalid');
          await page.getByLabel('Contraseña', { exact: true }).fill(clave);
          await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
          await page.waitForURL('**/admin');
          await page.goto('http://127.0.0.1:8180/admin/configuracion');
          await page.getByRole('heading', { name: 'Apariencia del negocio' }).waitFor();
          await page.getByLabel('Código de Acento y botones', { exact: true }).waitFor();
          assert.equal(await page.getByLabel('Código de Acento y botones', { exact: true }).inputValue(), '#2563eb');
          assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-header').trim()), '#152b4b');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.screenshot({ path: `.local/pruebas-v8/configuracion-${width}.png`, fullPage: false });
          if (width === 390) {
            await page.getByLabel('Código de Acento y botones', { exact: true }).fill('#f97316');
            await page.getByLabel('Fuente', { exact: true }).selectOption('sistema');
            await page.getByLabel('Imagen de portada', { exact: true }).setInputFiles('Frontend/public/icons/icon-192.png');
            await page.waitForFunction(() => document.querySelector('img[alt="Vista previa de la portada"]')?.src.startsWith('data:image/jpeg')); 
            await page.getByRole('button', { name: 'Guardar apariencia', exact: true }).click();
            await page.getByRole('status').filter({ hasText: 'Apariencia guardada' }).waitFor();
            await page.reload(); await page.getByRole('heading', { name: 'Apariencia del negocio' }).waitFor();
            assert.equal(await page.getByLabel('Fuente', { exact: true }).inputValue(), 'sistema');
            assert.ok((await pedir(null, '/apariencia')).imagen.startsWith('data:image/jpeg;base64,'));
            await pedir(admin, '/apariencia', 'PUT', tema);
          }
        }
        assert.deepEqual(errores, []);
        casos.push(`interfaz y scroll ${width}×${height}`);
      } finally { await contexto.close(); }
    }
    const ctxRol = await navegador.newContext(); const pRol = await ctxRol.newPage();
    await ctxRol.request.post('http://127.0.0.1:8180/api/v1/auth/login', { data: { identifier: vendedor.email, password: clave } });
    await pRol.goto('http://127.0.0.1:8180/admin/usuarios'); await pRol.waitForURL('**/vendedor');
    await pRol.getByText('Conteo diario', { exact: true }).waitFor();
    await ctxRol.close(); casos.push('vendedor vuelve a su pantalla y conserva el conteo diario');
    // Publica únicamente el build en un puerto efímero para verificar el worker de producción.
    const raiz = resolve('Frontend/dist');
    servidor = createServer(async (req, res) => {
      if (req.url.startsWith('/api/')) {
        try { const r = await fetch('http://127.0.0.1:3100' + req.url, { headers: { cookie: req.headers.cookie || '' } }); res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(await r.text()); }
        catch { res.writeHead(503); res.end('{}'); } return;
      }
      const archivo = resolve(raiz, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!archivo.startsWith(raiz + sep) && archivo !== raiz) { res.writeHead(404); res.end(); return; }
      const real = existsSync(archivo) && extname(archivo) ? archivo : resolve(raiz, 'index.html');
      const tipos = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': tipos[extname(real)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(real));
    });
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    const direccion = `http://127.0.0.1:${servidor.address().port}`;
    const ctxPwa = await chromium.launchPersistentContext(resolve('.local/pruebas-v8/perfil-pwa-' + etiqueta), { channel: 'chrome', headless: true }); const pagePwa = await ctxPwa.newPage();
    try {
      await pagePwa.goto(direccion); await pagePwa.evaluate(() => navigator.serviceWorker.ready);
      await pagePwa.reload(); await pagePwa.getByRole('heading', { name: 'Iniciar sesión' }).waitFor();
      const manifiesto = await pagePwa.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
      assert.equal(manifiesto.name, 'Synchronic.JO'); assert.equal(manifiesto.display, 'standalone');
      const cdp = await ctxPwa.newCDPSession(pagePwa); const estado = await cdp.send('Page.getInstallabilityErrors');
      assert.deepEqual(estado.installabilityErrors, []);
      assert.ok(await pagePwa.evaluate(() => Boolean(navigator.serviceWorker.controller)));
      assert.deepEqual(await pagePwa.evaluate(() => caches.keys()), []);
      await ctxPwa.setOffline(true); await pagePwa.reload(); await pagePwa.getByRole('heading', { name: 'Volvamos a conectar' }).waitFor();
      await ctxPwa.setOffline(false); await pagePwa.getByRole('button', { name: 'Reintentar' }).click();
      await pagePwa.getByRole('heading', { name: 'Iniciar sesión' }).waitFor();
      casos.push('PWA instalable: manifiesto, iconos, worker, aislamiento de datos y regreso tras desconexión');
    } finally { await ctxPwa.close(); }
    writeFileSync('.local/pruebas-v8/resultados.json', JSON.stringify({ fecha: new Date().toISOString(), casos }, null, 2));
    console.log(JSON.stringify({ aprobados: casos.length, casos }));
  } finally {
    if (original && admin) await pedir(admin, '/apariencia', 'PUT', original);
    if (navegador) await navegador.close();
    if (servidor) await new Promise(r => servidor.close(r));
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
