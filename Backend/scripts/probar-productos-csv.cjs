const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
assert.equal(base, 'http://localhost:8180', 'Solo QA');
const args = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml', 'exec', '-T', 'postgres'];
const user = execFileSync('docker.exe', [...args, 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
const sql = consulta => JSON.parse(execFileSync('docker.exe', [...args, 'psql', '-U', user, '-d', 'ambie_test', '-qAt', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: consulta }).trim());
const marca = 'QA-CSV-' + Date.now();

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
    const page = await context.newPage(), errores = [], rechazos = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('response', r => { if (r.status() === 401) rechazos.push(new URL(r.url()).pathname); });
    const me = await context.request.get(base + '/api/v1/auth/me'); assert.equal(me.status(), 200); assert.equal((await me.json()).data, null);
    assert.equal((await context.request.get(base + '/api/v1/pedidos')).status(), 401);
    await page.goto(base);
    await page.getByRole('textbox', { name: 'USUARIO O CORREO' }).fill('qa-admin@pruebas.invalid');
    await page.locator('input[type=password]').fill('SoloPruebas2026!');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(base + '/admin');
    await context.clearCookies({ name: 'ambie_access' });
    await page.reload(); await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor();
    assert.deepEqual(rechazos, [], 'Ingreso y restauración sin 401 de la consulta inicial');
    async function api(ruta, metodo = 'GET', datos, clave) {
      const respuesta = await context.request.fetch(base + '/api/v1' + ruta, { method: metodo, ...(datos ? { data: datos } : {}), ...(clave ? { headers: { 'Idempotency-Key': clave } } : {}) });
      return { status: respuesta.status(), cuerpo: await respuesta.json() };
    }
    const vendedorContexto = await browser.newContext();
    try {
      assert.equal((await vendedorContexto.request.post(base + '/api/v1/auth/login', { data: { identifier: 'qa-vendedor@pruebas.invalid', password: 'SoloPruebas2026!' } })).status(), 200);
      assert.equal((await vendedorContexto.request.post(base + '/api/v1/productos/importar', { data: { prepararInicial: false, productos: [{ nombre: marca, precioVenta: 1 }] } })).status(), 403);
    } finally { await vendedorContexto.close(); }
    await page.goto(base + '/admin/precios');
    const sinCantidades = 'codigoInterno,nombre,categoria,unidad,precioVenta,costoActual,cantidadInicial,stockMinimo\n' +
      `,${marca} vacío,Preparados,unidad,1200,500,,1\n,${marca} cero,Preparados,unidad,1300,600,0,2\n`;
    await page.getByLabel('Archivo CSV de productos').setInputFiles({name:'sin-existencias.csv',mimeType:'text/csv',buffer:Buffer.from(sinCantidades)});
    await page.getByText('Revisar 2 productos antes de guardar',{exact:true}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:'Preparar inventario inicial con las cantidades'}).isChecked(),false);
    const soloCatalogo = page.waitForResponse(r=>r.url().endsWith('/productos/importar') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Confirmar importación',exact:true}).click();
    assert.equal((await (await soloCatalogo).json()).data.conteoInicialId,null);
    const catalogoCero = sql(`SELECT json_agg(json_build_object('nombre',nombre,'stock',"stockFisico")) FROM productos WHERE nombre IN ('${marca} vacío','${marca} cero');`);
    assert.equal(catalogoCero.length,2); assert.ok(catalogoCero.every(p=>p.stock===0));
    // Preparar inicio conserva la diferencia entre una celda vacía y el cero explícito.
    await page.getByLabel('Archivo CSV de productos').setInputFiles({name:'inicio-cero.csv',mimeType:'text/csv',buffer:Buffer.from(sinCantidades)});
    await page.getByRole('checkbox',{name:'Preparar inventario inicial con las cantidades'}).check();
    const inicioCero = page.waitForResponse(r=>r.url().endsWith('/productos/importar') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Confirmar importación',exact:true}).click();
    const idCero = (await (await inicioCero).json()).data.conteoInicialId;
    const conteosCero = sql(`SELECT json_object_agg(p.nombre,l."stockFisico") FROM "conteoLineas" l JOIN productos p ON p.id=l."productoId" WHERE l."conteoId"='${idCero}' AND p.nombre IN ('${marca} vacío','${marca} cero');`);
    assert.equal(conteosCero[marca+' vacío'],null); assert.equal(conteosCero[marca+' cero'],0);
    const colaboradorInicial = await browser.newContext();
    try {
      const correoInicial = marca.toLowerCase()+'-inicial@pruebas.invalid';
      assert.equal((await api('/usuarios','POST',{nombre:'Colaborador inicial QA',email:correoInicial,password:'SoloPruebas2026!',rol:'inventario'})).status,201);
      assert.equal((await colaboradorInicial.request.post(base+'/api/v1/auth/login',{data:{identifier:correoInicial,password:'SoloPruebas2026!'}})).status(),200);
      assert.equal((await api('/inventario/compartidos','POST',{tipo:'inicial',turno:'Continuar CSV'})).cuerpo.data.id,idCero);
      const tomada = await colaboradorInicial.request.post(base+`/api/v1/inventario/compartidos/${idCero}/asignar`,{data:{}});
      assert.equal(tomada.status(),201); const asignada=(await tomada.json()).data;
      const detalleInicial=(await api('/inventario/conteos/'+idCero)).cuerpo.data;
      const fisico=detalleInicial.lineas.find(l=>l.productoId===asignada.productoId).stockTeorico;
      assert.equal((await colaboradorInicial.request.patch(base+`/api/v1/inventario/conteos/${idCero}/lineas/${asignada.productoId}?resumen=true`,{data:{stockFisico:fisico}})).status(),200);
      assert.equal((await api('/inventario/compartidos/'+idCero)).cuerpo.data.colaboradores,2);
      console.log('✓ Inventario inicial compartido: administrador y colaborador guardan en el mismo documento');
    } finally { await colaboradorInicial.close(); }
    console.log('✓ CSV: celda vacía y cero crean catálogo sin stock; en el inicio vacío queda pendiente y cero queda contado');

    await page.getByLabel('Archivo CSV de productos').setInputFiles('docs/ejemplos/catalogo-inicial.csv');
    await page.getByText('Revisar 3 productos antes de guardar', { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Preparar inventario inicial con las cantidades' }).check();
    const respuestaEjemplo = page.waitForResponse(r => r.url().endsWith('/productos/importar') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
    const ejemploRespuesta = await respuestaEjemplo; assert.equal(ejemploRespuesta.status(), 201);
    const ejemplo = (await ejemploRespuesta.json()).data; assert.equal(ejemplo.creados, 3);
    const guardados = sql(`SELECT json_agg(json_build_object('nombre',p.nombre,'codigo',p."codigoInterno",'categoria',c.nombre,'unidad',p.unidad,'precio',p."precioVenta",'costo',p."costoActual",'cantidad',p."stockFisico",'minimo',p."stockMinimo",'contada',l."stockFisico",'costoConteo',l."costoUnitarioConteo") ORDER BY p.nombre) FROM productos p JOIN categorias c ON c.id=p."categoriaId" JOIN "conteoLineas" l ON l."productoId"=p.id AND l."conteoId"='${ejemplo.conteoInicialId}' WHERE p.nombre LIKE 'Ejemplo CSV%';`);
    assert.equal(guardados.length, 3);
    const esperados = [
      {nombre:'Ejemplo CSV Arepa de queso',categoria:'Preparados',unidad:'unidad',precio:4500,costo:2100,cantidad:20,minimo:5},
      {nombre:'Ejemplo CSV Coca-Cola pequeña',categoria:'Bebidas',unidad:'botella',precio:2500,costo:1500,cantidad:12,minimo:3},
      {nombre:'Ejemplo CSV Empanada de pollo',categoria:'Preparados',unidad:'unidad',precio:3000,costo:1300,cantidad:15,minimo:4},
    ];
    for(let i=0;i<3;i++) { const {codigo,contada,costoConteo,...campos}=guardados[i]; assert.match(codigo,/^PROD-\d+$/); assert.deepEqual(campos,esperados[i]); assert.equal(contada,campos.cantidad); assert.equal(costoConteo,campos.costo); }
    await page.getByPlaceholder('Buscar por nombre, código o categoría').fill('Ejemplo CSV');
    for(const producto of esperados) await page.getByText(producto.nombre,{exact:true}).waitFor();
    await page.screenshot({path:'.local/pruebas-ui/csv-ejemplo-guardado.png'});
    const previo = (await api('/productos', 'POST', { nombre: marca + ' anterior', precioVenta: 1000, costoActual: 400, stock: 4 })).cuerpo.data;
    const nombre = marca + ' Arepa "doble", queso';
    const csv = '\uFEFFcodigoInterno,nombre,categoria,unidad,precioVenta,costoActual,cantidadInicial,stockMinimo\n' +
      '"","' + nombre.replaceAll('"', '""') + '",Preparados,unidad,2500,900,7,2\n' +
      `${previo.codigoInterno},${previo.nombre},,unidad,1500,400,10,1\n`;
    await page.goto(base + '/admin/precios');
    const entrada = page.getByLabel('Archivo CSV de productos');
    await entrada.setInputFiles({ name: 'productos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByText('Revisar 2 productos antes de guardar', { exact: true }).waitFor();
    assert.equal(sql(`SELECT count(*) FROM productos WHERE nombre LIKE '${marca}%';`), 3);
    await page.getByRole('checkbox', { name: 'Preparar inventario inicial con las cantidades' }).check();
    const respuestaCarga = page.waitForResponse(r => r.url().endsWith('/productos/importar') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
    const carga = await respuestaCarga; const cuerpoCarga = await carga.json();
    assert.equal(carga.status(), 201, JSON.stringify(cuerpoCarga));
    const resultado = cuerpoCarga.data; assert.equal(resultado.creados, 1); assert.equal(resultado.actualizados, 1); assert.ok(resultado.conteoInicialId);
    await page.getByText(/Guardado: 1 productos nuevos y 1 actualizados/).waitFor();
    const consulta = await api('/productos?q=' + encodeURIComponent(marca) + '&pageSize=200');
    const nuevo = consulta.cuerpo.data.find(p => p.nombre === nombre); assert.ok(nuevo); assert.match(nuevo.codigoInterno, /^PROD-\d+$/);
    assert.equal(nuevo.stockFisico, 7);
    assert.equal((await api('/productos/' + previo.id)).cuerpo.data.stockFisico, 4, 'El CSV no ajusta stock existente antes de confirmar el conteo');
    const cantidades = sql(`SELECT json_agg(json_build_object('productoId',"productoId",'cantidad',"stockFisico",'usuario',"contadoPorId") ORDER BY "productoId") FROM "conteoLineas" WHERE "conteoId"='${resultado.conteoInicialId}' AND "stockFisico" IS NOT NULL;`);
    assert.equal(cantidades.find(p => p.productoId === previo.id).cantidad, 10); assert.equal(cantidades.find(p => p.productoId === nuevo.id).cantidad, 7); assert.ok(cantidades.every(p => p.usuario));
    const productos = [{ nombre, precioVenta: 2500, stock: 7 }, { codigoInterno: previo.codigoInterno, nombre: previo.nombre, precioVenta: 1500, stock: 10 }];
    const clave = randomUUID();
    const repetida = await api('/productos/importar', 'POST', { prepararInicial: true, productos }, clave);
    assert.equal(repetida.status, 201); assert.equal(repetida.cuerpo.data.creados, 0);
    assert.deepEqual((await api('/productos/importar', 'POST', { prepararInicial: true, productos }, clave)).cuerpo, repetida.cuerpo);
    assert.equal(sql(`SELECT count(*) FROM productos WHERE nombre LIKE '${marca}%';`), 4);
    assert.equal(sql(`SELECT count(*) FROM "movimientosInventario" WHERE "productoId"='${nuevo.id}' AND tipo='inicializacion';`), 1);
    const antes = sql(`SELECT json_build_object('productos',(SELECT count(*) FROM productos),'consecutivo',(SELECT "ultimoValor" FROM consecutivos WHERE tipo='PROD' AND periodo='global'));`);
    const invalida = await api('/productos/importar', 'POST', { prepararInicial: false, productos: [{ nombre: marca + ' revertido', precioVenta: 9, stock: 3 }, { codigoInterno: 'PROD-NO-EXISTE', nombre: marca + ' inválido', precioVenta: 9 }] }, randomUUID());
    assert.equal(invalida.status, 400);
    assert.deepEqual(sql(`SELECT json_build_object('productos',(SELECT count(*) FROM productos),'consecutivo',(SELECT "ultimoValor" FROM consecutivos WHERE tipo='PROD' AND periodo='global'));`), antes, 'Rollback del lote y del consecutivo');
    const duplicada = await api('/productos/importar', 'POST', { prepararInicial: false, productos: [{ nombre, precioVenta: 9 }, { nombre, precioVenta: 12 }] });
    assert.equal(duplicada.status, 400); assert.equal((await api('/productos/' + nuevo.id)).cuerpo.data.precioVenta, 2500);
    const concurrente = { prepararInicial: false, productos: [{ nombre: marca + ' concurrente', precioVenta: 600, stock: 2 }] };
    const paralelas = await Promise.all([api('/productos/importar', 'POST', concurrente, randomUUID()), api('/productos/importar', 'POST', concurrente, randomUUID())]);
    assert.ok(paralelas.every(r => r.status === 201)); assert.equal(sql(`SELECT count(*) FROM productos WHERE nombre='${marca} concurrente';`), 1);
    // El catálogo cambió durante la prueba; otra carga sincroniza el borrador con el producto nuevo.
    assert.equal((await api('/productos/importar', 'POST', { prepararInicial: true, productos: [{ nombre: marca + ' concurrente', precioVenta: 600, stock: 2 }] })).status, 201);
    const conteo = (await api('/inventario/conteos/' + resultado.conteoInicialId)).cuerpo.data;
    for (const linea of conteo.lineas.filter(l => l.stockFisico === null)) assert.equal((await api(`/inventario/conteos/${conteo.id}/lineas/${linea.productoId}`, 'PATCH', { stockFisico: linea.stockTeorico })).status, 200);
    assert.equal((await api('/inventario/conteos/' + conteo.id + '/finalizar', 'POST', {})).status, 201);
    assert.equal((await api('/inventario/conteos/' + conteo.id + '/aplicar-ajuste', 'POST', {})).status, 201);
    assert.equal((await api('/productos/' + previo.id)).cuerpo.data.stockFisico, 10);
    assert.equal((await api('/inventario/inicial')).cuerpo.data.diferencias, 0);
    assert.deepEqual(sql(`SELECT json_build_object('unidades',SUM(l."stockFisico"),'valor',SUM(l."stockFisico"*l."costoUnitarioInicial")) FROM "conteoLineas" l JOIN productos p ON p.id=l."productoId" WHERE l."conteoId"='${conteo.id}' AND p.nombre LIKE 'Ejemplo CSV%';`),{unidades:47,valor:79500});
    const cerrada = await api('/productos/importar', 'POST', { prepararInicial: true, productos: [{ codigoInterno: previo.codigoInterno, nombre: previo.nombre, precioVenta: 1800, stock: 999 }] });
    assert.equal(cerrada.status, 409); assert.equal((await api('/productos/' + previo.id)).cuerpo.data.precioVenta, 1500);
    assert.equal((await api('/productos/importar', 'POST', { prepararInicial: false, productos: [{ codigoInterno: previo.codigoInterno, nombre: previo.nombre, precioVenta: 1800, stock: 999 }] })).status, 201);
    assert.equal((await api('/productos/' + previo.id)).cuerpo.data.stockFisico, 10);
    await page.goto(base + '/admin/precios');
    const descarga = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
    const exportado = await descarga; const texto = readFileSync(await exportado.path(), 'utf8');
    assert.ok(texto.includes('cantidadInicial')); assert.ok(texto.includes(nombre.replaceAll('"', '""'))); assert.ok(texto.includes(previo.codigoInterno));
    await entrada.setInputFiles({ name: 'otra.csv', mimeType: 'text/csv', buffer: Buffer.from('nombre;precioVenta;cantidadInicial\n"Producto con ; separador";12,50;2\n') });
    await page.getByText('Revisar 1 productos antes de guardar', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await entrada.setInputFiles({ name: 'incorrecta.csv', mimeType: 'text/csv', buffer: Buffer.from('nombre,precioVenta,cantidadInicial\nProducto,1200,-2\n') });
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('button', { name: 'Confirmar importación', exact: true }).count(), 0);
    assert.deepEqual(errores, []);
    mkdirSync('.local/pruebas-ui', { recursive: true });
    const informe = { fecha: new Date().toISOString(), archivoEjemplo:'docs/ejemplos/catalogo-inicial.csv', camposEjemploVerificados:guardados, sesionSin401Inicial: true, cargaDesdeFormulario: true, inicialRevisadoAplicado: true, reintentoSinDuplicados: true, loteAtomico: true, concurrenciaSinDuplicados: true, csvComillasSeparadores: true, exportacionCompleta: true, stockHistoricoConservado: true, errores };
    writeFileSync('.local/pruebas-ui/productos-csv.json', JSON.stringify(informe, null, 2)); console.log(JSON.stringify(informe, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
