const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { entenderBasico, responderCampo } = require('../dist/asistente/intenciones');
const { ConfiguracionAsistenteEsquema } = require('@ambie/contrato');
const catalogo = require('../../scripts/fixtures/catalogo-demo.json');

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
      const page = await context.newPage(); const errores = []; const pedidos = [{ id: 'credito-prueba', numero: 'PED-CREDITO', clienteId: 'isabel', vendedorId: 'ui-prueba', estado: 'pendiente', creadoEn: new Date().toISOString(), total: 6000, subtotal: 6000, lineas: [{ productoId: 'pepsi', nombre: 'Pepsi 400 ml', cantidad: 2, precioUnitario: 3000, subtotal: 6000 }], pago: { metodo: 'credito', montoRecibido: 0, saldoPendiente: 6000, estado: 'pendiente' }, historialEstados: [] }]; let guardados = 0, egresos = 0;
      let interpretaciones = 0;
      const conteosMock = [];
      const productosMock = catalogo.productos.map((p, i) => ({ ...p, id: i === 0 ? 'coca' : i === 2 ? 'pepsi' : i === 16 ? 'doritos' : `producto-${i}`, stockFisico: p.stock, stockReservado: 0, codigoInterno: `PROD-${i}`, activo: true }));
      productosMock.push({ id: 'yogur-fresa-litro', nombre: 'Yogur de fresa 1 L', precioVenta: 9000, stock: 30, stockFisico: 30, stockReservado: 0, costoActual: 1000, categoria: 'Lácteos', codigoInterno: 'yogur-fresa-litro', activo: true });
      await page.clock.install();
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
        if (['POST', 'PATCH', 'DELETE'].includes(req.method())) assert.ok(['/asistente/entender', '/asistente/voz/sesion', '/asistente/modelos', '/asistente/conexion', '/pedidos', '/caja/egresos'].includes(ruta), `No debe escribir un borrador: ${ruta}`);
        const usuario = { id: 'ui-prueba', nombre: 'Prueba', rol, activo: true, email: 'prueba@invalid.test', permisos: [] };
        if (ruta === '/auth/me') data = usuario;
        else if (ruta === '/asistente/preferencias') data = { vozHabilitada: true, confirmacionVoz: true, responderConVoz: false };
        else if (ruta === '/asistente/configuracion') data = { ...ConfiguracionAsistenteEsquema.parse({}), tieneClave: false };
        else if (ruta === '/asistente/voz/sesion') data = { ticket: 'simulado' };
        else if (ruta === '/asistente/modelos') { assert.equal(cuerpo.proveedor, 'gemini'); assert.equal(cuerpo.modelo, ''); assert.equal(cuerpo.clave, 'clave-ficticia'); data = ['gemini-modelo-prueba', 'gemini-otro-prueba']; }
        else if (ruta === '/asistente/conexion') { assert.equal(cuerpo.modelo, 'gemini-modelo-prueba'); data = { disponible: true, mensaje: 'Gemini respondió correctamente. No se guardaron datos del negocio.' }; }
        else if (ruta === '/asistente/entender') { interpretaciones++; data = cuerpo.pendiente && cuerpo.campo ? responderCampo(cuerpo.texto, cuerpo.pendiente, cuerpo.campo, rol) || entenderBasico(cuerpo.texto, rol, cuerpo.pendiente) : entenderBasico(cuerpo.texto, rol, cuerpo.pendiente); }
        else if (ruta === '/productos') data = productosMock;
        else if (ruta === '/inventario/conteos') data = conteosMock;
        else if (ruta === '/clientes') data = [{ ...catalogo.clientes[0], id: 'isabel', codigo: 'CLI-ISABEL', saldoPendiente: 0, activo: true }];
        else if (ruta === '/dashboard/resumen') data = { ventas: 6000, pedidos: 1, gastos: 0, compras: 0, ticketPromedio: 6000, creditoPendienteGlobal: 0, alertasStock: 0, serie: [{ dia: new Date().toLocaleDateString('en-CA'), ventas: 6000, costo: 3800, compras: 0, gastos: 0 }], topProductos: [], topClientes: [] };
        else if (ruta === '/usuarios') data = [usuario];
        else if (ruta === '/proveedores') data = [{ id: 'proveedor-demo', nombre: 'Distribuidora Bebidas Demo', telefono: '', activo: true }];
        else if (ruta === '/caja/egresos' && req.method() === 'POST') { assert.deepEqual(cuerpo, { concepto: 'Retiro de caja', monto: 5000, metodo: 'billetera' }); egresos++; data = { id: 'egreso-prueba' }; }
        else if (ruta === '/pedidos') {
          if (req.method() === 'POST') {
            guardados++; assert.equal(cuerpo.clienteId, guardados === 1 ? null : 'isabel'); assert.equal(cuerpo.metodo, guardados === 1 ? 'efectivo' : 'billetera');
            const esperadas = guardados === 1 ? [{ productoId: 'coca', cantidad: 1 }, { productoId: 'pepsi', cantidad: 2 }, { productoId: 'doritos', cantidad: 3 }] : [{ productoId: 'pepsi', cantidad: 3 }];
            assert.deepEqual([...cuerpo.lineas].sort((a,b) => a.productoId.localeCompare(b.productoId)), [...esperadas].sort((a,b) => a.productoId.localeCompare(b.productoId)));
            const lineas = cuerpo.lineas.map(l => { const p = productosMock.find(p => p.id === l.productoId); return { ...l, nombre: p.nombre, precioUnitario: p.precioVenta, subtotal: l.cantidad * p.precioVenta }; });
            const total = lineas.reduce((s,l) => s + l.subtotal, 0);
            pedidos.push({ id: `pedido-prueba-${guardados}`, numero: `PED-PRUEBA-${guardados}`, facturaNumero: `FAC-PRUEBA-${guardados}`, ...cuerpo, lineas, subtotal: total, total, creadoEn: new Date().toISOString(), estado: 'entregado', pago: { metodo: cuerpo.metodo, montoRecibido: total, saldoPendiente: 0, estado: 'pagado' }, historialEstados: [] }); data = pedidos.at(-1);
            if (guardados === 1) productosMock.find(p => p.id === 'pepsi').precioVenta = 9000;
          } else data = pedidos.filter(p => p.id !== 'pedido-prueba-1'); // Fuerza la lectura individual de la factura.
        }
        else if (ruta.startsWith('/pedidos/')) data = pedidos.find(p => p.id === decodeURIComponent(ruta.split('/')[2]));
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
        await page.evaluate(texto => window.__vozEnviar({ tipo: 'final', texto, confianza: 1 }), texto);
        await page.clock.fastForward(2300);
        await page.waitForTimeout(150); // Deja completar la petición y los dos frames de React; no reutilices el aviso anterior.
        const esperado = comprobar === 'En la lista:' ? /Productos actualizados|Revisa los productos/ : comprobar === 'La operación quedó guardada' ? /Pedido confirmado|La operación quedó guardada/ : comprobar;
        try { await page.getByRole('status').filter({ hasText: esperado }).last().waitFor({ timeout: 7000 }); }
        catch (e) { console.error('Estado visual:', await page.locator('body').innerText()); throw e; }
        await page.waitForFunction(() => document.querySelector('[aria-label^="Asistente de voz,"]')?.getAttribute('aria-label')?.includes('escuchando'));
      }
      await decir('voy a tomar un pedido', '¿Es para un cliente habitual');
      await decir('ocasional', '¿Qué productos necesita?');
      await decir('quiero 5 yogures de durazno y un de fresa', 'Hay varias presentaciones');
      assert.equal(guardados, 0);
      await decir('el de 200 ml', 'En la lista:');
      await page.getByPlaceholder('Buscar producto').fill('yogur');
      assert.match(await page.locator('body').innerText(), /6 unidad\(es\)/);
      await decir('confirmar productos', '¿Hay algo que preparar');
      await decir('no', '¿Cuál es el método de pago?');
      await decir('efectivo', 'Di confirmar operación');
      const detalleYogur = page.getByRole('region', { name: 'Detalle de productos' });
      assert.equal(await detalleYogur.locator('li').count(), 2);
      assert.match(await detalleYogur.locator('li').filter({ hasText: 'durazno' }).innerText(), /Cantidad: 5/);
      assert.match(await detalleYogur.locator('li').filter({ hasText: 'fresa' }).innerText(), /Cantidad: 1/);
      const subtitulo = page.locator('.asistente-subtitulo');
      assert.match(await subtitulo.innerText(), /Pedido listo\. Total: 20\.300/);
      assert.doesNotMatch(await subtitulo.innerText(), /durazno|fresa|clienteId/);
      const estilo = await subtitulo.evaluate(el => ({ alto: el.getBoundingClientRect().height, fondo: getComputedStyle(el).backgroundColor, clamp: getComputedStyle(el.firstElementChild).webkitLineClamp, eventos: getComputedStyle(el).pointerEvents }));
      assert.ok(estilo.alto <= 48); assert.equal(estilo.clamp, '2'); assert.equal(estilo.eventos, 'none'); assert.match(estilo.fondo, /0\.65/);
      await page.screenshot({ path: resolve('.ambie-config', `voz-yogures-${rol}-movil.png`) });
      await page.clock.fastForward(3600); assert.equal(await subtitulo.count(), 0);
      assert.equal(guardados, 0, 'Aclarar y confirmar productos no guarda el pedido');
      await decir('cancelar operación', 'Operación descartada');
      await decir('tomar pedido', '¿Es para un cliente habitual');
      await decir('ocasional', '¿Qué productos necesita?');
      await decir('quiero yogures de durazno', '¿Cuántas unidades?');
      await decir('cinco', 'En la lista:');
      assert.match(await page.locator('body').innerText(), /5 unidad\(es\)/);
      await decir('reemplaza por dos Pepsi 400 ml', 'En la lista:');
      await decir('reconstruir factura', '¿Qué productos necesita?');
      await page.evaluate(() => window.__vozEnviar({ tipo: 'final', texto: 'cinco yogures de durazno', confianza: .5 }));
      await page.clock.fastForward(2300);
      await page.getByRole('status').filter({ hasText: 'No escuché bien' }).waitFor();
      await decir('sí', '¿Cuántas unidades?');
      await decir('dos', 'En la lista:');
      assert.match(await page.locator('body').innerText(), /2 unidad\(es\)/);
      assert.equal(guardados, 0);
      await decir('reconstruir factura', '¿Qué productos necesita?');
      const antesDeDictar = interpretaciones;
      await page.evaluate(() => window.__vozEnviar({ tipo: 'final', texto: 'dos', confianza: 1 })); await page.clock.fastForward(1000);
      await page.evaluate(() => window.__vozEnviar({ tipo: 'final', texto: 'Pepsi cuatrocientos mililitros', confianza: 1 })); await page.clock.fastForward(1200);
      await page.evaluate(() => window.__vozEnviar({ tipo: 'parcial', texto: 'y tres' })); await page.clock.fastForward(1200);
      assert.equal(interpretaciones, antesDeDictar, 'No interpreta ni interrumpe entre palabras');
      await decir('y tres Doritos queso', 'En la lista:');
      assert.equal(interpretaciones, antesDeDictar + 1, 'Una interpretación para el dictado completo');
      await decir('una Coca Cola', 'Hay varias presentaciones'); assert.equal(guardados, 0);
      await decir('noventa Pepsi 400 ml', 'Conservé la lista anterior'); assert.equal(guardados, 0);
      await decir('una Coca Cola cuatrocientos mililitros', 'En la lista:');
      await decir('quita Pepsi 400 ml', 'En la lista:');
      assert.equal(guardados, 0);
      await decir('un Pepsi 400 ml', 'En la lista:');
      await decir('agrega un Pepsi 400 ml', 'En la lista:');
      assert.match(page.url(), /pedido/);
      await decir('confirmar productos', '¿Hay algo que preparar');
      await decir('no', '¿Cuál es el método de pago?');
      await decir('crédito', '¿Cuál es el método de pago?'); assert.equal(guardados, 0);
      await decir('efectivo', 'Di confirmar operación');
      const detalleAntesDePagar = page.getByRole('region', { name: 'Detalle de productos' });
      assert.equal(await detalleAntesDePagar.locator('li').count(), 3);
      assert.match(await detalleAntesDePagar.locator('li').filter({ hasText: 'Pepsi' }).innerText(), /Cantidad: 2/);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.match(page.url(), /pedido$/);
      assert.equal(await page.getByText('Crédito', { exact: true }).count(), 0);
      assert.ok(await page.getByRole('button', { name: /Confirmar pedido/ }).isVisible());
      await page.screenshot({ path: resolve('.ambie-config', `voz-${rol}-movil.png`) });
      await decir('sí', 'Di confirmar operación'); assert.equal(guardados, 0);
      await decir('confirmar operación', 'La operación quedó guardada'); assert.equal(guardados, 1);
      const factura = page.getByRole('region', { name: 'Detalle de productos' });
      await factura.waitFor(); assert.equal(await factura.locator('li').count(), 3);
      await page.getByText('Factura FAC-PRUEBA-1', { exact: true }).waitFor();
      const pepsiFacturada = factura.locator('li').filter({ hasText: 'Pepsi 400 ml' });
      assert.match(await pepsiFacturada.innerText(), /Cantidad: 2/);
      assert.match(await pepsiFacturada.innerText(), /3\.000/); assert.match(await pepsiFacturada.innerText(), /6\.000/);
      assert.doesNotMatch(await pepsiFacturada.innerText(), /9\.000/);
      await page.screenshot({ path: resolve('.ambie-config', `factura-${rol}-movil.png`) });
      await decir('tomar pedido', '¿Es para un cliente habitual');
      await decir('habitual', '¿Qué cliente?');
      await page.getByRole('button', { name: 'Isabel Rojas', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Seleccioné a Isabel Rojas' }).waitFor();
      assert.equal(await page.getByPlaceholder('Buscar por nombre, alias o teléfono').inputValue(), '');
      assert.equal(await page.getByText('Paso 1 de 4 · Cliente').count(), 1);
      await decir('confirmar cliente', '¿Qué productos necesita?');
      await decir('tres Pepsi 400 ml', 'En la lista:');
      await decir('confirmar productos', '¿Hay algo que preparar');
      await page.getByRole('button', { name: 'Volver', exact: true }).first().click();
      await page.getByRole('status').filter({ hasText: /Productos actualizados|Revisa los productos/ }).waitFor();
      await decir('continuar', '¿Hay algo que preparar');
      await decir('volver', 'En la lista:');
      await decir('continuar', '¿Hay algo que preparar');
      await decir('no', '¿Cuál es el método de pago?');
      await decir('volver a cliente', '¿Qué cliente?');
      await page.getByRole('button', { name: /Confirmar cliente · Isabel Rojas/ }).click();
      await page.getByRole('status').filter({ hasText: /Productos actualizados|Revisa los productos/ }).waitFor();
      await decir('continuar', '¿Hay algo que preparar');
      await decir('continuar', '¿Cuál es el método de pago?');
      await decir('billetera', 'Di confirmar operación');
      await decir('volver', '¿Cuál es el método de pago?');
      await decir('billetera', 'Di confirmar operación');
      assert.equal(guardados, 1);
      await decir('confirmar operación', 'La operación quedó guardada'); assert.equal(guardados, 2);
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
        await decir('cambiar precio', '¿Qué producto?');
        await decir('Pepsi 400 ml', '¿Cuál es el nuevo precio?');
        await decir('cinco mil', 'Di confirmar operación');
        await decir('volver', '¿Cuál es el nuevo precio?');
        assert.equal(await page.locator('input[type=number]').inputValue(), '5000');
        await decir('volver', '¿Qué producto?');
        await decir('cancelar operación', 'Operación descartada');
        await decir('registrar egreso', '¿Cuál es el concepto?');
        await decir('Transporte de mercancía', '¿Cuál es el monto?');
        await decir('cinco mil', '¿Cuál es el método de pago?');
        await decir('volver', '¿Cuál es el monto?');
        assert.equal(await page.getByLabel('Monto', { exact: true }).inputValue(), '5000');
        await decir('volver', '¿Cuál es el concepto?');
        assert.equal(await page.getByLabel('Concepto', { exact: true }).inputValue(), 'Transporte de mercancía');
        await decir('cancelar operación', 'Operación descartada'); assert.equal(egresos, 1);
        await decir('registrar cierre', '¿Qué fecha?');
        const fechaHoy = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
        await decir(fechaHoy, '¿Cuánto efectivo contaste?');
        await decir('cinco mil', '¿Cuánto hay en billetera?');
        await decir('seis mil', 'Di confirmar operación');
        await decir('volver', '¿Cuánto hay en billetera?');
        await decir('volver', '¿Cuánto efectivo contaste?');
        assert.deepEqual(await page.locator('input[type=number]').evaluateAll(inputs => inputs.map(i => i.value)), ['5000', '6000']);
        await decir('cancelar operación', 'Operación descartada');
        await decir('ajustar inventario', '¿Qué producto?');
        await decir('Pepsi 400 ml', 'Indica stock fisico');
        await decir('cincuenta', 'Di confirmar operación');
        await decir('volver', 'Revisa stock fisico en pantalla.');
        assert.equal(await page.getByPlaceholder('Ej. 45').inputValue(), '50');
        await decir('volver', '¿Qué producto?');
        await decir('cancelar operación', 'Operación descartada');
        await decir('iniciar conteo', 'Indica tipo');
        await decir('general', 'Indica turno');
        await decir('tarde', 'Di confirmar operación');
        assert.equal(await page.getByRole('combobox').inputValue(), 'tarde');
        await decir('volver', 'Revisa turno');
        await decir('volver', 'Revisa tipo');
        await decir('cancelar operación', 'Operación descartada');
        conteosMock.push({ id: 'conteo-prueba', tipo: 'general', turno: 'tarde', estado: 'en-curso', usuarioId: 'ui-prueba', iniciadoEn: new Date().toISOString(), lineasContadas: [], lineas: [{ productoId: 'pepsi', nombre: 'Pepsi 400 ml', stockTeorico: 54, stockFisico: 54, diferencia: 0 }] });
        await page.evaluate(() => window.dispatchEvent(new Event('ambie:datos-actualizados')));
        await page.waitForTimeout(200);
        await decir('contar producto', 'Indica stock fisico');
        await decir('cuarenta', '¿Qué conteo de inventario?');
        await decir('conteo-prueba', '¿Qué producto?');
        await decir('Pepsi 400 ml', 'Di confirmar operación');
        assert.equal(await page.getByPlaceholder('0', { exact: true }).inputValue(), '40');
        await decir('volver', '¿Qué producto?');
        await decir('volver', '¿Qué conteo de inventario?');
        await decir('cancelar operación', 'Operación descartada');
        await decir('crear usuario', '¿Cuál es el nombre?');
        await decir('Elena Restrepo', '¿Cuál es el correo?');
        await decir('elena@invalid.test', 'Indica rol');
        await decir('vendedor', 'Escribe la contraseña');
        await page.locator('input[type=password]').fill('SoloBorrador-2026!');
        await decir('revisar operación', 'Di confirmar operación');
        await decir('volver', 'Escribe la contraseña');
        assert.equal(await page.locator('input[type=password]').inputValue(), 'SoloBorrador-2026!');
        await decir('volver', 'Revisa rol');
        await decir('cancelar operación', 'Operación descartada');
        await decir('abrir créditos', 'Abrir creditos');
        await decir('recibir abono', '¿Qué cliente?');
        await decir('Isabel Rojas', '¿Cuál es el monto?');
        await decir('mil', '¿Cuál es el método de pago?');
        await decir('efectivo', 'Di confirmar operación');
        assert.match(page.url(), /admin\/creditos$/);
        await decir('volver', '¿Cuál es el método de pago?');
        await decir('volver', '¿Cuál es el monto?');
        assert.equal(await page.locator('input[type=number]').inputValue(), '1000');
        await decir('volver', '¿Qué cliente?');
        await decir('cancelar operación', 'Operación descartada');
        await decir('registrar compra', '¿A qué proveedor');
        await decir('Distribuidora Bebidas Demo', '¿Qué productos necesita?');
        await decir('dos Pepsi 400 ml', '¿Se descuenta esta compra');
        await decir('sí', 'Producto 1:');
        await decir('mil', 'Di confirmar operación');
        await decir('volver', '¿Se descuenta esta compra');
        await decir('volver', '¿Qué productos necesita?');
        await decir('volver', '¿A qué proveedor');
        await decir('cancelar operación', 'Operación descartada');
        for (const modulo of ['ventas', 'cierre', 'caja', 'precios', 'créditos', 'pedidos', 'inventario', 'usuarios', 'configuración', 'compras', 'auditoría']) {
          await decir(`abrir ${modulo}`, `Abrir ${modulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`);
          assert.match(page.url(), new RegExp(`/admin/${modulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}$`));
          await decir('volver', 'Volvimos al inicio'); assert.match(page.url(), /\/admin$/);
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(150);
      await page.screenshot({ path: resolve('.ambie-config', `voz-${rol}-escritorio.png`) });
      const escritorio = await microfono.boundingBox(); assert.ok(escritorio.x >= 0 && escritorio.x + escritorio.width <= 1440);
      await microfono.click(); assert.equal(await microfono.getAttribute('aria-pressed'), 'false'); assert.equal(await page.getByRole('dialog').count(), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/${rol === 'administrador' ? 'admin/pedidos' : 'vendedor'}`);
      const tarjetaPedido = page.getByRole('button').filter({ hasText: 'PED-PRUEBA-2' });
      await tarjetaPedido.waitFor();
      assert.match(await tarjetaPedido.innerText(), /3 × Pepsi 400 ml/);
      await tarjetaPedido.click();
      const detalleLista = page.getByRole('region', { name: 'Detalle de productos' });
      await detalleLista.waitFor();
      assert.equal(await detalleLista.locator('li').count(), 1);
      assert.match(await detalleLista.innerText(), /Cantidad: 3/);
      assert.match(await detalleLista.innerText(), /9\.000/);
      await page.screenshot({ path: resolve('.ambie-config', `detalle-pedido-${rol}-movil.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.ok(await detalleLista.isVisible());
      await page.screenshot({ path: resolve('.ambie-config', `detalle-pedido-${rol}-escritorio.png`) });
      assert.equal(guardados, 2, 'Consultar el detalle no genera nuevas transacciones');
      if (rol === 'administrador') {
        await page.goto(`${base}/admin/configuracion`);
        await page.getByLabel('Proveedor', { exact: false }).selectOption('gemini');
        await page.getByLabel('Clave de API', { exact: true }).fill('clave-ficticia');
        assert.equal(await page.locator('input[list="modelos-asistente"]').inputValue(), '');
        await page.getByRole('button', { name: 'Consultar modelos disponibles' }).click();
        await page.getByLabel('Modelos disponibles', { exact: false }).selectOption('gemini-modelo-prueba');
        await page.getByRole('button', { name: 'Probar respuesta de Gemini' }).click();
        await page.getByRole('status').filter({ hasText: 'Gemini respondió correctamente' }).last().waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: resolve('.ambie-config', 'configuracion-gemini-movil.png') });
        assert.equal(guardados, 2);
      }
      assert.deepEqual(errores, []); console.log(`✓ ${rol}: selección y confirmación de cliente, retroceso cliente/productos/entrega/pago, borrador conservado, guardado explícito y navegación de módulos`);
      await context.close();
    }
  } finally { await browser.close(); servidor.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
