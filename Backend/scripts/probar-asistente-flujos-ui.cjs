const assert = require('node:assert/strict');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
assert.equal(base, 'http://localhost:8180', 'Solo QA; nunca escribir en el negocio');
const marca = `VozQA${Date.now()}`, resultados = [];
async function main() {
  await mkdir(resolve('.local/pruebas-ui'), { recursive: true });
  const raiz = resolve('Frontend/dist');
  const servidor = createServer(async (req, res) => {
    const ruta = resolve(raiz, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!ruta.startsWith(raiz)) { res.writeHead(403); res.end(); return; }
    const archivo = /\.(js|css|svg|png|ico|woff2)$/.test(ruta) ? ruta : resolve(raiz, 'index.html');
    try { const buffer = await readFile(archivo); res.setHeader('Content-Type', archivo.endsWith('.js') ? 'text/javascript' : archivo.endsWith('.css') ? 'text/css' : archivo.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(buffer); } catch { res.writeHead(404); res.end(); }
  }); servidor.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  const vista = `http://localhost:${servidor.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    for (const rol of ['administrador', 'vendedor']) {
      if (process.env.CASO_PRUEBA_VOZ === 'cierre' && rol !== 'administrador') continue;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
      async function api(ruta, metodo = 'GET', cuerpo) {
        const r = await context.request.fetch(base + '/api/v1' + ruta, { method: metodo, data: cuerpo });
        const datos = await r.json(); assert.ok(r.ok(), `${metodo} ${ruta}: ${r.status()} ${datos.message || ''}`); return datos.data;
      }
      await api('/auth/login', 'POST', { identifier: `qa-${rol === 'administrador' ? 'admin' : 'vendedor'}@pruebas.invalid`, password: 'SoloPruebas2026!' });
      if (rol === 'administrador') assert.equal((await api('/asistente/configuracion')).proveedor, 'basico', 'No consumir proveedores remotos');
      const cliente = await api('/clientes', 'POST', { nombre: `${marca} ${rol}`, telefono: '3000000000', direccion: 'Dirección QA', alias: marca });
      const producto = rol === 'administrador' ? await api('/productos', 'POST', { nombre: `${marca} bebida 200 ml`, precioVenta: 2000, costoActual: 800, stock: 100 }) : (await api('/productos?pageSize=200')).find(p => p.nombre === `${marca} bebida 200 ml`);
      assert.ok(producto);
      if (rol === 'administrador') {
        const variantes = await api('/productos?q=Yogur%20de%20fresa&pageSize=200');
        if (!variantes.some(p => p.nombre === 'Yogur de fresa 1 L')) await api('/productos', 'POST', { nombre: 'Yogur de fresa 1 L', precioVenta: 9000, costoActual: 2000, stock: 30 });
      }
      const page = await context.newPage(), errores = [], escrituras = [], tiempos = []; let simulada = null;
      page.setDefaultTimeout(15000);
      page.on('pageerror', e => errores.push(e.message));
      page.on('request', r => { if (r.url().includes('/api/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) && !/\/asistente\/|\/auth\//.test(r.url())) escrituras.push({ ruta: new URL(r.url()).pathname, cuerpo: r.postDataJSON() }); });
      await page.addInitScript(() => {
        window.__avisosVoz = [];
        new MutationObserver(() => { const texto = document.querySelector('.asistente-subtitulo')?.textContent; if (texto && window.__avisosVoz.at(-1) !== texto) window.__avisosVoz.push(texto); }).observe(document, { childList: true, subtree: true, characterData: true });
        const Original = window.WebSocket;
        window.WebSocket = class {
          static OPEN = 1; readyState = 0; bufferedAmount = 0;
          constructor(url, protocolos) { if (!String(url).includes('/asistente/voz')) return new Original(url, protocolos); window.__vozEnviar = evento => this.onmessage?.({ data: JSON.stringify(evento) }); setTimeout(() => { this.readyState = 1; this.onmessage?.({ data: JSON.stringify({ tipo: 'lista' }) }); }, 10); }
          send() {} close() { this.readyState = 3; }
        };
      });
      await page.route('**/api/v1/**', async route => { const url = new URL(route.request().url()); try { const respuesta = await route.fetch({ url: base + url.pathname + url.search, headers: { ...route.request().headers(), origin: base } }); await route.fulfill({ response: respuesta }); } catch { await route.abort().catch(() => undefined); } });
      await page.route('**/api/v1/asistente/preferencias', route => route.fulfill({ json: { data: { vozHabilitada: true, confirmacionVoz: true, responderConVoz: false } } }));
      await page.route('**/api/v1/asistente/entender', async route => { if (!simulada) return route.fallback(); const data = simulada; simulada = null; await route.fulfill({ json: { data } }); });
      await page.goto(vista + (rol === 'administrador' ? '/admin/ventas' : '/vendedor'));
      const mic = page.getByRole('button', { name: /Asistente de voz,/ }); await mic.waitFor(); assert.equal(await mic.getAttribute('aria-pressed'), 'false'); await mic.click(); await page.locator('.asistente-subtitulo').waitFor();
      const subtitulo = await page.locator('.asistente-subtitulo').evaluate(e => ({ puntero: getComputedStyle(e).pointerEvents, fondo: getComputedStyle(e).backgroundColor, lineas: getComputedStyle(e.querySelector('span')).webkitLineClamp }));
      assert.equal(subtitulo.puntero, 'none'); assert.equal(subtitulo.lineas, '2'); assert.match(subtitulo.fondo, /0\.65/);
      const posicionInicial = await mic.boundingBox(); await mic.press('ArrowLeft'); const posicionNueva = await mic.boundingBox(); assert.ok(posicionNueva.x < posicionInicial.x); assert.equal(await mic.getAttribute('aria-pressed'), 'true');
      const rutaInicial = page.url(); await page.evaluate(() => window.__vozEnviar({ tipo: 'parcial', texto: 'crea un pedido para' })); await page.waitForTimeout(2400); assert.equal(page.url(), rutaInicial); assert.equal(escrituras.length, 0);
      async function decir(texto, esperado, intencion) {
        console.log(`→ ${rol}: ${texto}`);
        await page.waitForFunction(() => /escuchando|listo para confirmar/.test(document.querySelector('[aria-label^="Asistente de voz,"]')?.getAttribute('aria-label') || ''));
        simulada = intencion ? { ...intencion, destino: null, mensaje: 'Revisa antes de confirmar.' } : null;
        await page.waitForTimeout(3600);
        const inicio = Date.now();
        await page.evaluate(texto => window.__vozEnviar({ tipo: 'final', texto, confianza: 1 }), texto);
        await page.waitForTimeout(2300);
        try { await page.locator('.asistente-subtitulo').filter({ hasText: esperado }).waitFor({ timeout: 15000 }); } catch(e) { console.error(await page.evaluate(() => ({ avisos: window.__avisosVoz.slice(-4), estado: document.querySelector('[aria-label^="Asistente de voz,"]')?.getAttribute('aria-label') }))); console.error(await page.locator('body').innerText()); throw e; }
        tiempos.push(Date.now() - inicio);
      }
      async function consultarSecciones() {
        for (const modulo of ['inicio','ventas','pedidos','creditos','inventario','compras','precios','caja','cierre','usuarios','auditoria','configuracion']) {
          await decir(`abrir ${modulo}`, `Abrir ${modulo}`);
          for (const ancho of [390,1440]) { await page.setViewportSize({ width: ancho, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), modulo + ': sin desbordamiento'); }
          resultados.push({ rol, caso: `consulta ${modulo}`, correcto: true });
        }
      }
      if (process.env.CASO_PRUEBA_VOZ === 'continuacion' && rol === 'administrador') {
        const fecha = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
        assert.ok((await api('/cierres?pageSize=200')).some(c => c.fecha.startsWith(fecha)), 'Se necesita el cierre QA existente');
        await decir('registrar cierre', /listo\./, { accion: 'registrar_cierre', payload: { fecha, conteoEfectivo: 5000, conteoBilletera: 6000 } });
        await decir('confirma', 'No se guardó');
        await consultarSecciones();
        assert.equal(escrituras.length, 0); assert.deepEqual(errores, []);
        resultados.push({ rol, caso: 'navegación después de cierre rechazado', correcto: true });
        await context.close(); continue;
      }
      if (process.env.CASO_PRUEBA_VOZ === 'cierre') {
        const fecha = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
        assert.ok((await api('/cierres?pageSize=200')).some(c => c.fecha.startsWith(fecha)), 'Este caso comprueba el cierre ya registrado en QA');
        await decir('registrar cierre', /listo\./, { accion: 'registrar_cierre', payload: { fecha, conteoEfectivo: 5000, conteoBilletera: 6000 } });
        await decir('confirma', 'No se guardó'); assert.equal(escrituras.length, 0); await page.getByText('Este día ya fue cerrado. Consulta el historial.').waitFor();
        resultados.push({ rol, caso: 'cierre duplicado rechazado desde voz', correcto: true }); await context.close(); continue;
      }
      const detalle = page.getByRole('region', { name: 'Detalle de productos' });
      await decir(`Crea un pedido para ${cliente.nombre} de dos ${producto.nombre}, entrega inmediata, pago en efectivo`, 'Pedido listo');
      await detalle.waitFor(); assert.match(await detalle.innerText(), /Cantidad: 2/); assert.equal(escrituras.length, 0); assert.equal(await page.getByRole('dialog').count(), 0);
      await decir(`Cambia las dos ${producto.nombre} por cinco y el pago a transferencia`, 'Pedido listo'); assert.match(await detalle.innerText(), /Cantidad: 5/);
      await decir('volver', 'Volvimos'); await page.getByText(/Paso 3 de 4/).waitFor(); await decir('revisar operación', 'Pedido listo'); assert.match(await detalle.innerText(), /Cantidad: 5/);
      await decir('confirma', 'Pedido confirmado'); assert.equal(escrituras.length, 1); assert.equal(escrituras[0].cuerpo.metodo, 'billetera'); assert.deepEqual(escrituras[0].cuerpo.lineas, [{ productoId: producto.id, cantidad: 5 }]);
      const guardado = (await api('/pedidos?pageSize=200')).find(p => p.clienteId === cliente.id); assert.ok(guardado); assert.equal(Number((await api(`/pedidos/${guardado.id}`)).total), 10000);
      await decir('confirma', 'Completa y revisa'); assert.equal(escrituras.length, 1);
      await decir(`Crea venta ocasional con dos ${producto.nombre}, entrega inmediata, pago en efectivo`, 'Pedido listo'); assert.equal(await page.getByText('Crédito', { exact: true }).count(), 0); await decir('cancelar', 'Operación cancelada'); assert.equal(escrituras.length, 1);
      await decir(`Crea pedido para ${cliente.nombre} de cinco yogures de durazno y uno de fresa, entrega inmediata, pago efectivo`, 'Hay varias presentaciones');
      assert.equal(escrituras.length, 1); await decir('el de 200 ml', 'Pedido listo');
      assert.equal(await detalle.locator('li').count(), 2); assert.match(await detalle.innerText(), /Cantidad: 5/);
      await decir('aumentar cantidad', 'Solo hay', { accion: 'crear_pedido', payload: { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 1000 }], estadoInicial: 'entregado', metodo: 'efectivo' } });
      assert.equal(escrituras.length, 1); assert.equal(await detalle.locator('li').count(), 2);
      await decir('cancelar', 'Operación cancelada');
      resultados.push({ rol, caso: 'pedido completo/corrección/retroceso/cancelación/duplicado', correcto: true, interpretacion: 'API básica real' });
      if (rol === 'administrador') {
        async function operacion(accion, payload, verificar, manual) {
          const antes = escrituras.length; await decir(accion, manual ? 'Escribe la contraseña' : /listo\.|Monto:/, { accion, payload });
          if (manual) { await manual(); await decir('revisar operación', /listo\./); }
          assert.equal(escrituras.length, antes, accion + ': interpretar no guarda');
          await page.screenshot({ path: resolve('.local/pruebas-ui', `${accion}-movil.png`) });
          await decir('confirma', 'Operación guardada'); const cantidad = accion === 'cobrar_pedido' ? 2 : 1;
          assert.equal(escrituras.length, antes + cantidad, accion + ': acciones normales de la pantalla');
          assert.equal(new Set(escrituras.slice(antes).map(e => e.ruta)).size, cantidad, accion + ': no repetir la misma escritura'); await verificar();
          await decir('confirma', 'Completa y revisa'); assert.equal(escrituras.length, antes + cantidad);
          resultados.push({ rol, caso: accion, correcto: true, interpretacion: 'simulada; frontend/API/BD reales' });
        }
        let nuevoProducto, proveedor, usuario;
        await operacion('crear_producto', { nombre: `${marca} nuevo`, precioVenta: 4000, costoActual: 1000, stock: 20, stockMinimo: 2, categoria: 'Bebidas', unidad: 'unidad' }, async () => { nuevoProducto = (await api('/productos?pageSize=200')).find(p => p.nombre === `${marca} nuevo`); assert.ok(nuevoProducto); });
        await operacion('cambiar_precio', { productoId: nuevoProducto.id, nuevoPrecio: 4500 }, async () => assert.equal(Number((await api(`/productos/${nuevoProducto.id}`)).precioVenta), 4500));
        await operacion('ajustar_inventario', { productoId: nuevoProducto.id, stockFisico: 30, motivo: 'conteo', comentario: 'QA' }, async () => assert.equal((await api(`/productos/${nuevoProducto.id}`)).stockFisico, 30));
        await operacion('crear_proveedor', { nombre: `${marca} proveedor`, telefono: '3000000000' }, async () => { proveedor = (await api('/proveedores?pageSize=200')).find(p => p.nombre === `${marca} proveedor`); assert.ok(proveedor); });
        await operacion('registrar_compra', { proveedorId: proveedor.id, lineas: [{ productoId: nuevoProducto.id, cantidad: 2, costoUnitario: 900 }], descontarCaja: false }, async () => assert.equal((await api(`/productos/${nuevoProducto.id}`)).stockFisico, 32));
        await operacion('registrar_gasto', { concepto: `${marca} transporte`, monto: 500 }, async () => assert.ok((await api('/gastos?pageSize=200')).some(g => g.concepto === `${marca} transporte`)));
        await operacion('registrar_egreso', { concepto: `${marca} retiro`, monto: 600, metodo: 'billetera' }, async () => assert.ok((await api('/caja/movimientos?pageSize=200')).some(m => m.concepto === `${marca} retiro`)));
        await operacion('crear_cliente', { nombre: `${marca} adicional`, telefono: '3000000001', direccion: 'Dirección QA', alias: 'QA' }, async () => assert.ok((await api('/clientes?pageSize=200')).some(c => c.nombre === `${marca} adicional`)));
        await operacion('crear_usuario', { nombre: `${marca} acceso`, email: `${marca.toLowerCase()}@pruebas.invalid`, rol: 'vendedor' }, async () => { usuario = (await api('/usuarios')).find(u => u.nombre === `${marca} acceso`); assert.ok(usuario); }, () => page.locator('input[type=password]').fill('SoloPruebas2026!'));
        await operacion('cambiar_rol_usuario', { usuarioId: usuario.id, rol: 'administrador' }, async () => assert.equal((await api('/usuarios')).find(u => u.id === usuario.id).rol, 'administrador'));
        await operacion('cambiar_estado_usuario', { usuarioId: usuario.id }, async () => assert.equal((await api('/usuarios')).find(u => u.id === usuario.id).activo, false));
        const credito = await api('/pedidos', 'POST', { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 2 }], estadoInicial: 'pendiente', metodo: 'credito', momentoCobro: 'segun-periodicidad' });
        await page.evaluate(() => window.dispatchEvent(new Event('ambie:datos-actualizados'))); await page.waitForTimeout(1200);
        await operacion('recibir_abono', { clienteId: cliente.id, monto: 500, metodo: 'efectivo' }, async () => assert.equal(Number((await api(`/pedidos/${credito.id}`)).pago.saldoPendiente), 3500));
        await operacion('cobrar_pedido', { pedidoId: credito.id, metodo: 'billetera' }, async () => assert.equal(Number((await api(`/pedidos/${credito.id}`)).pago.saldoPendiente), 0));
        const pendiente = await api('/pedidos', 'POST', { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 1 }], estadoInicial: 'pendiente', metodo: 'efectivo', momentoCobro: 'inmediato' });
        await page.evaluate(() => window.dispatchEvent(new Event('ambie:datos-actualizados'))); await page.waitForTimeout(1200);
        await operacion('trasladar_pedido', { pedidoId: pendiente.id }, async () => assert.notEqual((await api(`/pedidos/${pendiente.id}`)).fechaOperacion, pendiente.fechaOperacion));
        await operacion('cambiar_estado_pedido', { pedidoId: pendiente.id, estado: 'cancelado' }, async () => assert.equal((await api(`/pedidos/${pendiente.id}`)).estado, 'cancelado'));
        const conteosAnteriores = new Set((await api('/inventario/conteos')).map(c => c.id)); let conteo;
        await operacion('iniciar_conteo', { tipo: 'aleatorio', cantidadAleatoria: 1, turno: 'tarde' }, async () => { conteo = (await api('/inventario/conteos')).find(c => !conteosAnteriores.has(c.id)); assert.ok(conteo); });
        assert.equal(conteo.lineas.length, 1); const lineaConteo = conteo.lineas[0];
        await operacion('contar_producto', { conteoId: conteo.id, productoId: lineaConteo.productoId, stockFisico: lineaConteo.stockTeorico + 1 }, async () => assert.equal((await api('/inventario/conteos')).find(c => c.id === conteo.id).lineas.find(l => l.productoId === lineaConteo.productoId).stockFisico, lineaConteo.stockTeorico + 1));
        await operacion('finalizar_conteo', { conteoId: conteo.id }, async () => assert.equal((await api('/inventario/conteos')).find(c => c.id === conteo.id).estado, 'confirmado'));
        await operacion('aplicar_conteo', { conteoId: conteo.id }, async () => assert.equal((await api(`/productos/${lineaConteo.productoId}`)).stockFisico, lineaConteo.stockTeorico + 1));
        const idsConteos = new Set((await api('/inventario/conteos')).map(c => c.id));
        await operacion('iniciar_conteo', { tipo: 'aleatorio', cantidadAleatoria: 1, turno: 'tarde' }, async () => { conteo = (await api('/inventario/conteos')).find(c => !idsConteos.has(c.id)); assert.ok(conteo); });
        await operacion('cancelar_conteo', { conteoId: conteo.id }, async () => assert.equal((await api('/inventario/conteos')).find(c => c.id === conteo.id).estado, 'cancelado'));
        const fecha = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
        if (!(await api('/cierres?pageSize=200')).some(c => c.fecha.startsWith(fecha))) await operacion('registrar_cierre', { fecha, conteoEfectivo: 5000, conteoBilletera: 6000 }, async () => assert.ok((await api('/cierres?pageSize=200')).some(c => c.fecha.startsWith(fecha))));
        else { const antes = escrituras.length; await decir('registrar cierre', /listo\./, { accion: 'registrar_cierre', payload: { fecha, conteoEfectivo: 5000, conteoBilletera: 6000 } }); await decir('confirma', 'No se guardó'); assert.equal(escrituras.length, antes); resultados.push({ rol, caso: 'cierre duplicado rechazado desde voz', correcto: true }); }
        await consultarSecciones();
      } else {
        await decir('crear usuario administrador', 'No tienes permisos'); assert.equal(escrituras.length, 1);
        const credito = await api('/pedidos', 'POST', { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 1 }], estadoInicial: 'pendiente', metodo: 'credito', momentoCobro: 'segun-periodicidad' });
        await page.evaluate(() => window.dispatchEvent(new Event('ambie:datos-actualizados'))); await page.waitForTimeout(1200);
        await decir('recibir abono', /listo\.|Monto:/, { accion: 'recibir_abono', payload: { clienteId: cliente.id, monto: 500, metodo: 'efectivo' } }); assert.equal(escrituras.length, 1);
        await decir('confirma', 'Operación guardada'); assert.equal(escrituras.length, 2); assert.equal(Number((await api(`/pedidos/${credito.id}`)).pago.saldoPendiente), 1500);
        await decir('confirma', 'Completa y revisa'); assert.equal(escrituras.length, 2);
        resultados.push({ rol, caso: 'abono y permisos', correcto: true, interpretacion: 'simulada; frontend/API/BD reales' });
      }
      assert.deepEqual(errores, []); tiempos.sort((a,b) => a-b); console.log(`✓ ${rol}: ${escrituras.length} escrituras confirmadas; p95 texto→respuesta ${tiempos[Math.floor(tiempos.length*.95)]} ms`); await context.close();
    }
  } finally { await writeFile(resolve('.local/pruebas-ui', process.env.CASO_PRUEBA_VOZ === 'cierre' ? 'voz-cierre-resultados.json' : 'voz-resultados.json'), JSON.stringify({ fecha: new Date().toISOString(), base, resultados }, null, 2)); await browser.close(); servidor.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
