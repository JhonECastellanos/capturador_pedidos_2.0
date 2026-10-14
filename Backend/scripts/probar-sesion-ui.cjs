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
          addEventListener('synchronic:sesion-expirada', () => window.expiraciones++);
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
    if (process.argv.includes('--api-real')) resultados.push(...await probarApiReal(navegador, base));
    console.log(JSON.stringify({ aprobados: resultados.length, casos: resultados }));
  } finally { await navegador.close(); await servidor.close(); }
}
// Solo crea y modifica sesiones ficticias en la base QA; no toca datos comerciales.
async function probarApiReal(navegador, base) {
  require('dotenv').config({ quiet: true });
  const { PrismaClient } = require('@prisma/client');
  const { JwtService } = require('@nestjs/jwt');
  const db = new URL('postgresql://127.0.0.1:5433/ambie_test?schema=public');
  db.username = process.env.POSTGRES_USER || 'ambie'; db.password = process.env.POSTGRES_PASSWORD;
  const prisma = new PrismaClient({ datasources: { db: { url: db.href } } });
  const origen = 'http://127.0.0.1:8180';
  const aprobados = [];
  try {
    for (const caso of ['sin-cookie', 'cookie-inexistente', 'revocada', 'refresh-vencido', 'acceso-vencido', 'solo-refresh']) {
      const contexto = await navegador.newContext();
      let sid;
      try {
        if (caso === 'cookie-inexistente') {
          await contexto.addCookies([
            { name: 'ambie_access', value: 'acceso-invalido', url: origen, httpOnly: true },
            { name: 'ambie_refresh', value: 'renovacion-inexistente', url: origen, httpOnly: true },
          ]);
        } else if (caso !== 'sin-cookie') {
          const ingreso = await contexto.request.post(origen + '/api/v1/auth/login', { data: { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' } });
          assert.equal(ingreso.status(), 200, 'Ingreso ficticio en QA');
          const sesion = (await ingreso.json()).data;
          const claims = JSON.parse(Buffer.from(sesion.accessToken.split('.')[1], 'base64url').toString()); sid = claims.sid;
          const registro = await prisma.sesion.findUnique({ where: { id: sid }, include: { usuario: true } });
          assert.equal(registro.usuario.email, 'qa-admin@pruebas.invalid');
          if (caso === 'revocada') await prisma.sesion.update({ where: { id: sid }, data: { revocadoEn: new Date() } });
          if (caso === 'refresh-vencido') await prisma.sesion.update({ where: { id: sid }, data: { expiraEn: new Date(Date.now() - 1000) } });
          if (caso === 'solo-refresh') await contexto.clearCookies({ name: 'ambie_access' });
          if (caso === 'acceso-vencido') {
            const vencido = new JwtService().sign({ sid, cod: claims.cod, rol: claims.rol }, {
              secret: process.env.JWT_SECRET, subject: claims.sub, issuer: claims.iss, audience: claims.aud, expiresIn: -60,
            });
            await contexto.addCookies([{ name: 'ambie_access', value: vencido, url: origen, httpOnly: true }]);
          }
        }
        const pagina = await contexto.newPage();
        const red = [];
        await pagina.route(base + '/', r => r.fulfill({ contentType: 'text/html', body: '<html><body>Sesión QA</body></html>' }));
        await pagina.route('**/api/v1/**', async r => {
          const destino = origen + new URL(r.request().url()).pathname;
          const respuesta = await r.fetch({ url: destino });
          red.push({ ruta: new URL(destino).pathname, status: respuesta.status() });
          await r.fulfill({ response: respuesta });
        });
        await pagina.goto(base);
        const usuario = await pagina.evaluate(async () => {
          window.transporte = await import('/src/data/api.ts');
          return window.transporte.api('/auth/me');
        });
        const renovable = ['acceso-vencido', 'solo-refresh'].includes(caso);
        assert.equal(Boolean(usuario), renovable, caso);
        assert.equal(red.filter(r => r.ruta.endsWith('/auth/refresh')).length, renovable ? 1 : 0, 'Solo se renueva una sesión vigente');
        assert.ok(red.every(r => r.status === 200), 'Recuperación sin errores HTTP de autenticación');
        const cookies = await contexto.cookies(origen);
        if (!renovable) {
          assert.equal(cookies.filter(c => c.name.startsWith('ambie_')).length, 0, 'Cookies antiguas retiradas');
          const protegido = await contexto.request.get(origen + '/api/v1/clientes');
          assert.equal(protegido.status(), 401, 'Las operaciones privadas siguen protegidas');
          await pagina.evaluate(() => window.transporte.api('/auth/login', 'POST', { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' }));
          assert.ok(await pagina.evaluate(() => window.transporte.api('/auth/me')), 'Puede ingresar después de limpiar una sesión antigua');
        } else {
          assert.ok(cookies.find(c => c.name === 'ambie_access' && c.httpOnly));
          assert.ok(cookies.find(c => c.name === 'ambie_refresh' && c.httpOnly));
        }
        await pagina.evaluate(() => window.transporte.api('/auth/logout', 'POST', {}));
        assert.equal(await pagina.evaluate(() => window.transporte.api('/auth/me')), null);
        assert.equal((await contexto.cookies(origen)).filter(c => c.name.startsWith('ambie_')).length, 0);
        aprobados.push('api-real:' + caso);
        await pagina.close();
      } finally { await contexto.close(); }
    }
    // Un refresh inválido enviado directamente sigue rechazándose; no se oculta el 401.
    const rechazo = await fetch(origen + '/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: 'renovacion-inexistente' }) });
    assert.equal(rechazo.status, 401);
    return aprobados;
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
