// Ejercicios comerciales en Chrome y PostgreSQL QA; nunca escribe en el negocio.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const origen = 'http://localhost:8180';
const marca = 'QA-Catalogo-' + Date.now();
const carpeta = '.local/pruebas-productos-compras';
const args = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml', 'exec', '-T', 'postgres'];
const usuarioBD = execFileSync('docker.exe', [...args, 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
const sql = consulta => JSON.parse(execFileSync('docker.exe', [...args, 'psql', '-U', usuarioBD, '-d', 'ambie_test', '-qAt', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: consulta }).trim());
async function main() {
  mkdirSync(carpeta, { recursive: true });
  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  const casos = [], tiempos = [], errores = [];
  try {
    const admin = await navegador.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true, timezoneId: 'America/Bogota' });
    const api = async (ctx, ruta, metodo = 'GET', datos, status = metodo === 'POST' ? 201 : 200, clave = randomUUID()) => {
      const r = await ctx.request.fetch(origen + '/api/v1' + ruta, { method: metodo, headers: { 'Idempotency-Key': clave }, ...(datos === undefined ? {} : { data: datos }) });
      const cuerpo = await r.json(); assert.equal(r.status(), status, JSON.stringify({ ruta, cuerpo })); return cuerpo.data;
    };
    await api(admin, '/auth/login', 'POST', { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' }, 200);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const resumen = () => api(admin, `/dashboard/resumen?desde=${hoy}&hasta=${hoy}`);
    const previo = await resumen(); await resumen();
    const correoVendedor = marca + '-ventas@pruebas.invalid', correoInventario = marca + '-conteo@pruebas.invalid';
    for (const [email, rol] of [[correoVendedor, 'vendedor'], [correoInventario, 'inventario']]) await api(admin, '/usuarios', 'POST', { nombre: marca + '-' + rol, email, password: 'SoloPruebas2026!', rol });
    const vendedor = await navegador.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true });
    const contador = await navegador.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true });
    await api(vendedor, '/auth/login', 'POST', { identifier: correoVendedor, password: 'SoloPruebas2026!' }, 200);
    await api(contador, '/auth/login', 'POST', { identifier: correoInventario, password: 'SoloPruebas2026!' }, 200);
    await api(contador, '/productos', 'POST', { nombre: marca + '-no permitido', precioVenta: 1 }, 403);
    await api(admin, '/productos/inicial/' + randomUUID(), 'POST', {nombre:'Registro inválido',unidad:'unidad',cantidad:0}, 404);
    casos.push('Alta ausente en Stock general; solo un inicial abierto habilita el alta para colaboradores');
    const page = await admin.newPage(); page.on('pageerror', e => errores.push(e.message));
    const venta = await vendedor.newPage(); venta.on('pageerror', e => errores.push(e.message));
    await venta.goto(origen + '/vendedor/pedido'); await venta.getByText('Venta abierta · cliente ocasional', { exact: true }).click();
    await venta.getByPlaceholder('Buscar producto o código').fill(marca);
    // Proveedor creado por su formulario de recepción.
    await page.goto(origen + '/admin/compras'); await page.getByRole('button', { name: /Nueva recepción/ }).click();
    await page.getByRole('button', { name: /Crear proveedor/ }).click();
    await page.getByPlaceholder('Nombre', { exact: true }).fill(marca + ' Distribuciones Centro');
    await page.getByPlaceholder('Teléfono', { exact: true }).fill('3000000001');
    await page.getByRole('button', { name: 'Crear y seleccionar', exact: true }).click();
    await page.getByRole('button', { name: /Continuar a productos/ }).click();
    await page.getByRole('button', { name: '+ Producto', exact: true }).click();
    await page.getByRole('button', { name: 'Escanear código', exact: true }).waitFor();
    // Una rueda real detecta recortes que el auto-scroll de Playwright puede ocultar.
    async function alcanzar(boton) {
      const paso = page.getByRole('main', { name: 'Productos de la recepción', exact: true });
      const marco = await paso.boundingBox(); assert.ok(marco && marco.height > 0);
      await paso.evaluate(e => { e.scrollTop = 0; });
      await page.mouse.move(marco.x + marco.width / 2, marco.y + marco.height / 2);
      let visible = false;
      for (let n = 0; n < 50; n++) {
        const r = await boton.boundingBox();
        if (r && r.y >= marco.y && r.y + r.height <= marco.y + marco.height) { visible = true; break; }
        await page.mouse.wheel(0, Math.min(120, marco.height / 3));
        await page.waitForTimeout(40);
      }
      assert.ok(visible, 'El botón debe quedar completo dentro del área desplazable');
      assert.equal(await boton.evaluate(e => { const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), true, 'El botón no debe quedar tapado');
    }
    for (const [width,height] of [[320,480],[390,844],[390,400],[768,1024],[1440,900]]) {
      await page.setViewportSize({width,height});
      await alcanzar(page.getByRole('button', { name: 'Crear producto', exact: true }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({path:`${carpeta}/alta-alcanzable-${width}-${height}.png`});
    }
    await page.setViewportSize({width:393,height:873});
    casos.push('Alta desde Compras: rueda real alcanza Crear producto sin recortes en 320, 390, teclado de poca altura, tablet 768 y escritorio 1440');
    const nombre = marca + ' Galletas de avena', codigo = marca + '-BARRAS';
    await page.getByLabel('Código de barras o QR', { exact: true }).fill(codigo);
    await page.getByLabel('Nombre del producto', { exact: true }).fill(nombre);
    await page.getByLabel('Unidad o presentación', { exact: true }).fill('paquete');
    await page.getByLabel('Categoría', { exact: true }).fill('Snacks');
    await page.getByLabel('Costo del producto', { exact: true }).fill('1200');
    await page.getByLabel('Precio de venta', { exact: true }).fill('2500');
    await page.getByLabel('Stock mínimo', { exact: true }).fill('3');
    await alcanzar(page.getByRole('button', { name: 'Crear producto', exact: true }));
    const alta = page.waitForResponse(r => r.url().endsWith('/api/v1/productos') && r.request().method() === 'POST');
    const inicio = performance.now(); await page.getByRole('button', { name: 'Crear producto', exact: true }).click();
    const respuestaAlta = await alta; assert.equal(respuestaAlta.status(), 201); const p = (await respuestaAlta.json()).data;
    tiempos.push({ operacion: 'alta de producto', respuestaConfirmadaMs: Math.round(performance.now() - inicio) });
    assert.equal(p.stockFisico, 0); assert.equal(p.unidad, 'paquete'); assert.equal(p.precioVenta, 2500); assert.equal(p.stockMinimo, 3);
    await page.getByLabel('Cantidad de ' + nombre, { exact: true }).fill('12');
    await page.getByLabel('Costo de ' + nombre, { exact: true }).fill('1200');
    await page.getByRole('button', { name: 'Agregar ' + nombre, exact: true }).click();
    await alcanzar(page.getByRole('button', { name: /Revisar y confirmar/ }));
    await page.getByRole('button', { name: /Revisar y confirmar/ }).click();
    await page.getByRole('checkbox', { name: /Descontar de caja/ }).uncheck();
    const guardado = page.waitForResponse(r => r.url().endsWith('/api/v1/recepciones-compra') && r.request().method() === 'POST');
    const empieza = performance.now(); await page.getByRole('button', { name: /Confirmar recepción/ }).click();
    const respuesta = await guardado; assert.equal(respuesta.status(), 201); const recepcion = (await respuesta.json()).data;
    tiempos.push({ operacion: 'recepción de 12 paquetes', respuestaConfirmadaMs: Math.round(performance.now() - empieza) });
    assert.equal(recepcion.total, 14400);
    // El vendedor ya estaba en el catálogo antes del alta: la revisión remota debe actualizarlo.
    await venta.getByText(nombre, { exact: true }).waitFor({ timeout: 15000 });
    await venta.getByText(nombre, { exact: true }).locator('..').getByText(/12 disp/).waitFor({ timeout: 15000 });
    tiempos.push({ operacion: 'compra visible para el vendedor sin recargar', desdeConfirmacionMs: Math.round(performance.now() - empieza) });
    const datoBD = sql(`SELECT json_build_object('nombre',p.nombre,'unidad',p.unidad,'fisico',p."stockFisico",'precio',p."precioVenta",'costo',p."costoActual",'minimo',p."stockMinimo",'cantidad',l.cantidad,'subtotal',l.subtotal,'total',r.total,'codigo',cp.codigo,'ledger',(SELECT sum("deltaStockFisico") FROM "movimientosInventario" WHERE "productoId"=p.id)) FROM productos p JOIN "recepcionLineas" l ON l."productoId"=p.id JOIN "recepcionesCompra" r ON r.id=l."recepcionCompraId" JOIN "codigosProducto" cp ON cp."productoId"=p.id WHERE p.id='${p.id}' AND r.id='${recepcion.id}';`);
    assert.deepEqual(datoBD, { nombre, unidad: 'paquete', fisico: 12, precio: 2500, costo: 1200, minimo: 3, cantidad: 12, subtotal: 14400, total: 14400, codigo, ledger: 12 });
    casos.push('Compra desde formularios: proveedor, producto, alias, 12 paquetes y total 14.400 coinciden en PostgreSQL; vendedor ve stock sin recargar');
    const proveedor2 = await api(admin, '/proveedores', 'POST', { nombre: marca + ' Suministros Norte', telefono: '3000000002' });
    const bebida = await api(admin, '/productos', 'POST', { nombre: marca + ' Agua 500 ml', unidad: 'botella', precioVenta: 1800, costoActual: 800, stock: 0 });
    const arroz = await api(admin, '/productos', 'POST', { nombre: marca + ' Arroz 1 kg', unidad: 'bolsa', precioVenta: 4200, costoActual: 3000, stock: 0 });
    const clave = randomUUID(), compra = { proveedorId: proveedor2.id, descontarCaja: false, lineas: [{ productoId: bebida.id, cantidad: 7, costoUnitario: 800 }, { productoId: arroz.id, cantidad: 5, costoUnitario: 3000 }] };
    const [uno, dos] = await Promise.all([api(admin, '/recepciones-compra', 'POST', compra, 201, clave), api(admin, '/recepciones-compra', 'POST', compra, 201, clave)]);
    assert.equal(uno.id, dos.id); assert.equal(uno.total, 20600);
    for (const [prod, cantidad] of [[bebida, 7], [arroz, 5]]) assert.equal((await api(vendedor, '/productos/' + prod.id)).stock, cantidad);
    assert.equal(sql(`SELECT to_json(COUNT(*)) FROM "recepcionesCompra" WHERE id='${uno.id}';`), 1);
    const actualizado = await resumen(); assert.equal(actualizado.compras - previo.compras, 35000); assert.notEqual(actualizado.cache.version, previo.cache.version); assert.equal((await resumen()).cache.estado, 'hit');
    casos.push('Segundo proveedor: 7 botellas y 5 bolsas, total 20.600; reintento concurrente guarda una recepción; caché suma 35.000 de compras');
    // Una reserva permite detectar la diferencia entre físico y disponible al editar.
    const pedido = await api(admin, '/pedidos', 'POST', { lineas: [{ productoId: p.id, cantidad: 2 }], metodo: 'efectivo', momentoCobro: 'al-entregar', estadoInicial: 'pendiente' });
    await page.goto(origen + '/admin/inventario'); await page.getByText('Stock general', { exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: '+ Producto', exact: true }).count(), 0);
    await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(nombre);
    await page.getByRole('button', { name: 'Ajustar cantidades de ' + nombre, exact: true }).click();
    const cantidad = page.locator('input[type=number]').first(); assert.equal(await cantidad.inputValue(), '12');
    await page.getByRole('link', { name: 'Editar información del producto', exact: true }).click();
    await page.getByLabel('Nombre del producto', { exact: true }).waitFor();
    assert.equal(await page.locator('input[type=number]').first().inputValue(), '2500');
    await page.goto(origen + '/admin/inventario'); await page.getByText('Stock general', { exact: true }).first().click();
    await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(nombre);
    await page.getByRole('button', { name: 'Ajustar cantidades de ' + nombre, exact: true }).click();
    await cantidad.fill('10'); await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirmar ajuste manual', exact: true }).getByRole('button', { name: 'Aplicar ajuste', exact: true }).click();
    await page.getByRole('button', { name: 'Volver al menú de inventario', exact: true }).click();
    await page.getByText('Descuadres', { exact: true }).first().click();
    await page.getByPlaceholder('Buscar producto o turno').fill(nombre);
    await page.getByText('-2 falta', { exact: true }).waitFor(); await page.getByText(/Valor de la diferencia:/).waitFor();
    assert.equal((await api(vendedor, '/productos/' + p.id)).stock, 8);
    const diferencia = (await api(admin, '/inventario/descuadres?q=' + encodeURIComponent(nombre))).find(l => l.tipo === 'manual');
    assert.equal(diferencia.stockTeorico, 12); assert.equal(diferencia.stockFisico, 10); assert.equal(diferencia.valorDiferencia, -2400); assert.ok(diferencia.usuario && diferencia.finalizadoEn); assert.equal(diferencia.yaAjustado, true);
    const conAjuste = await resumen(); assert.equal(conAjuste.descuadres.faltantes - actualizado.descuadres.faltantes, 2400);
    await api(admin, '/inventario/ajustes', 'POST', { productoId: p.id, stockFisico: 13, motivo: 'corrección', comentario: marca + ' sobrante' });
    const conSobrante = await resumen(); assert.equal(conSobrante.descuadres.sobrantes - conAjuste.descuadres.sobrantes, 3600);
    await api(admin, '/inventario/ajustes', 'POST', { productoId: p.id, stockFisico: 1, motivo: 'corrección' }, 400);
    assert.equal((await api(admin, '/productos/' + p.id)).stockFisico, 13);
    const historial = await api(admin, '/inventario/descuadres?q=' + encodeURIComponent(nombre)); assert.equal(historial.length, 2);
    assert.equal(sql(`SELECT to_json("stockFisico"=(SELECT sum("deltaStockFisico") FROM "movimientosInventario" WHERE "productoId"=p.id)) FROM productos p WHERE id='${p.id}';`), true);
    casos.push('Edición desde stock con reserva: físico 12→10→13, faltante 2.400 y sobrante 3.600; ambos quedan una vez en Descuadres e Inicio, con fecha y usuario');
    // Catálogo ya creado también disponible para el colaborador de conteos.
    const general = await api(admin, '/inventario/conteos', 'POST', { tipo: 'general', turno: marca });
    const asignacion = await api(contador, `/inventario/compartidos/${general.id}/asignar`, 'POST', { productoId: arroz.id }); assert.equal(asignacion.productoId, arroz.id);
    await api(contador, `/inventario/conteos/${general.id}/lineas/${arroz.id}?resumen=true`, 'PATCH', { stockFisico: 5 });
    await api(admin, '/inventario/conteos/' + general.id + '/cancelar', 'POST', {});
    await api(admin, '/pedidos/' + pedido.id + '/estado', 'PATCH', { estado: 'cancelado' });
    casos.push('Colaborador encuentra y cuenta el producto comprado, conserva cantidad y autor; sin permisos de alta ni operaciones de venta');
    await page.goto(origen + '/admin/productos'); await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(nombre); await page.getByText(nombre, { exact: true }).first().click(); await page.getByLabel('Nombre del producto', { exact: true }).waitFor();
    assert.equal((await api(admin, '/productos/' + p.id + '/historial')).length, 0);
    await page.screenshot({ path: carpeta + '/producto-393.png' });
    const aparienciaAnterior = await api(admin, '/apariencia');
    const colores = { robotReposo:'#9c27b0',robotEscuchando:'#009688',robotHablando:'#e91e63' };
    try {
      await page.goto(origen+'/admin/configuracion');
      for (const [rotulo,valor] of [['Robot en reposo',colores.robotReposo],['Robot escuchando',colores.robotEscuchando],['Robot respondiendo',colores.robotHablando]]) await page.getByLabel('Código de '+rotulo,{exact:true}).fill(valor);
      const guardada=page.waitForResponse(r=>r.url().endsWith('/api/v1/apariencia') && r.request().method()==='PUT');
      await page.getByRole('button',{name:'Guardar apariencia',exact:true}).click();assert.equal((await guardada).status(),200);
      const enAPI=await api(admin,'/apariencia');for(const k of Object.keys(colores))assert.equal(enAPI[k],colores[k]);
      const enBD=sql(`SELECT json_build_object('robotReposo',configuracion->>'robotReposo','robotEscuchando',configuracion->>'robotEscuchando','robotHablando',configuracion->>'robotHablando') FROM "configuracionesVisuales" WHERE id='principal';`);assert.deepEqual(enBD,colores);
      await page.reload();await page.getByLabel('Código de Robot en reposo',{exact:true}).waitFor();
      for (const [campo,valor] of [['Robot en reposo',colores.robotReposo],['Robot escuchando',colores.robotEscuchando],['Robot respondiendo',colores.robotHablando]]) assert.equal(await page.getByLabel('Código de '+campo,{exact:true}).inputValue(),valor);
      const robot=page.getByRole('button',{name:'Asistente',exact:true});await robot.waitFor();
      const antes=await robot.getAttribute('data-estado');
      for(const [estado,rgb] of [['reposo','rgb(156, 39, 176)'],['escuchando','rgb(0, 150, 136)'],['hablando','rgb(233, 30, 99)']]){await robot.evaluate((e,v)=>e.setAttribute('data-estado',v),estado);assert.equal(await robot.evaluate(e=>getComputedStyle(e).color),rgb);}
      await robot.evaluate((e,v)=>e.setAttribute('data-estado',v),antes);
      await api(admin,'/apariencia','PUT',{...enAPI,robotReposo:'rojo'},400);
      await api(vendedor,'/apariencia','PUT',enAPI,403);
      assert.deepEqual(await api(admin,'/apariencia'),enAPI);
      casos.push('Colores del robot: vista previa, guardado real en API/PostgreSQL, recarga y tres estados CSS; formato inválido y vendedor rechazados sin cambios; no se prueba audio');
    } finally { await api(admin,'/apariencia','PUT',aparienciaAnterior); }
    assert.deepEqual(errores, []);
    writeFileSync(carpeta + '/resultados.json', JSON.stringify({ fecha: new Date().toISOString(), marca, casos, tiempos, errores }, null, 2));
    for (const caso of casos) console.log('✓ ' + caso); console.log(JSON.stringify(tiempos));
  } finally { await navegador.close(); }
}
main().catch(e => { console.error(String(e.stack).replace(/ambie_(?:access|refresh)=[^;\s]+/g, 'sesion=[oculta]')); process.exitCode = 1; });
