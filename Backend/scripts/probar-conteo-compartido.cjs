const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
assert.equal(base, 'http://localhost:8180', 'Solo QA aislada');
const args = ['compose','-p','ambie-integracion','-f','docker-compose.yml','-f','docker-compose.pruebas.yml','exec','-T','postgres'];
const dbUser = execFileSync('docker.exe',[...args,'printenv','POSTGRES_USER'],{encoding:'utf8'}).trim();
const sql = query => JSON.parse(execFileSync('docker.exe',[...args,'psql','-U',dbUser,'-d','ambie_test','-qAt','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8'}).trim());
const marca = 'QA-conteo-' + Date.now();
const password = 'SoloPruebas2026!';
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errores = [];
  try {
    const admin = await browser.newContext({viewport:{width:1440,height:900}});
    async function llamada(contexto, ruta, method = 'GET', data) {
      const r = await contexto.request.fetch(base+'/api/v1'+ruta,{method,data,headers:method==='GET'?{}:{'Idempotency-Key':randomUUID()}});
      return {status:r.status(), body:await r.json()};
    }
    assert.equal((await llamada(admin,'/auth/login','POST',{identifier:'qa-admin@pruebas.invalid',password})).status,200);
    // Más de una página: ninguna cuenta depende del recorte visual.
    assert.equal((await llamada(admin,'/productos/importar','POST',{prepararInicial:false,productos:Array.from({length:36},(_,i)=>({nombre:marca+' producto '+String(i).padStart(2,'0'),precioVenta:1000,costoActual:100,stock:10}))})).status,201);
    const colaboradores = [];
    for (let i=0;i<3;i++) {
      const email=marca+'-'+i+'@pruebas.invalid';
      const creado=await llamada(admin,'/usuarios','POST',{nombre:'Contador QA '+i,email,rol:'inventario',password});
      assert.equal(creado.status,201,JSON.stringify(creado.body));
      const contexto=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      assert.equal((await llamada(contexto,'/auth/login','POST',{identifier:email,password})).status,200);
      colaboradores.push({contexto,id:creado.body.data.id,email});
    }
    for (const previo of (await llamada(admin,'/inventario/compartidos?abiertos=true')).body.data.filter(c=>c.tipo==='general')) await llamada(admin,`/inventario/conteos/${previo.id}/cancelar`,'POST',{});
    const general = await llamada(admin,'/inventario/compartidos','POST',{tipo:'general',turno:'Prueba simultánea'});
    assert.equal(general.status,201,JSON.stringify(general.body)); const id=general.body.data.id;
    assert.equal((await llamada(admin,'/inventario/compartidos','POST',{tipo:'general',turno:'Reintento'})).body.data.id,id);
    const tomadas=await Promise.all(colaboradores.map(c=>llamada(c.contexto,`/inventario/compartidos/${id}/asignar`,'POST',{})));
    assert.ok(tomadas.every(r=>r.status===201)); assert.equal(new Set(tomadas.map(r=>r.body.data.productoId)).size,3);
    const ajena=tomadas[0].body.data.productoId;
    assert.equal((await llamada(colaboradores[1].contexto,`/inventario/conteos/${id}/lineas/${ajena}?resumen=true`,'PATCH',{stockFisico:999})).status,409);
    assert.equal((await llamada(admin,`/inventario/conteos/${id}/lineas/${ajena}?resumen=true`,'PATCH',{stockFisico:999})).status,409);
    assert.equal((await llamada(admin,`/inventario/conteos/${id}/finalizar`,'POST',{})).status,409);
    const guardados=await Promise.all(colaboradores.map((c,i)=>llamada(c.contexto,`/inventario/conteos/${id}/lineas/${tomadas[i].body.data.productoId}?resumen=true`,'PATCH',{stockFisico:i+2})));
    assert.ok(guardados.every(r=>r.status===200),JSON.stringify(guardados));
    assert.equal((await llamada(colaboradores[0].contexto,`/inventario/conteos/${id}/lineas/${ajena}?resumen=true`,'PATCH',{stockFisico:999})).status,409);
    const persisted=sql(`SELECT json_build_object('colaboradores',(SELECT count(*) FROM "participantesConteo" WHERE "conteoId"='${id}'),'contadas',(SELECT count(*) FROM "conteoLineas" WHERE "conteoId"='${id}' AND "stockFisico" IS NOT NULL),'unidades',(SELECT sum("stockFisico") FROM "conteoLineas" WHERE "conteoId"='${id}'));`);
    assert.deepEqual(persisted,{colaboradores:3,contadas:3,unidades:9});
    const resumen=(await llamada(admin,`/inventario/compartidos/${id}`)).body.data;
    assert.equal(resumen.colaboradores,3); assert.equal(resumen.contadas,3); assert.equal(resumen.unidades,9);
    assert.equal((await llamada(admin,`/inventario/compartidos/${id}/lineas?page=1`)).body.data.length,30);
    assert.ok((await llamada(admin,`/inventario/compartidos/${id}/lineas?page=2`)).body.data.length>0);
    // La API rechaza operaciones comerciales aunque se conozca la ruta.
    for(const ruta of ['/pedidos','/clientes','/productos','/usuarios','/dashboard/resumen','/inventario/inicial']) assert.equal((await llamada(colaboradores[0].contexto,ruta)).status,403,ruta);
    assert.equal((await llamada(colaboradores[0].contexto,`/inventario/conteos/${id}/finalizar`,'POST',{})).status,403);
    assert.equal((await llamada(colaboradores[0].contexto,`/inventario/conteos/${id}/aplicar-ajuste`,'POST',{})).status,403);
    assert.equal((await llamada(colaboradores[0].contexto,'/sincronizacion/revision')).status,200);
    // Una asignación vencida no permite guardar; otro colaborador puede recuperarla.
    const vieja=(await llamada(colaboradores[0].contexto,`/inventario/compartidos/${id}/asignar`,'POST',{})).body.data;
    sql(`UPDATE "conteoLineas" SET "asignadoHasta"=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE "conteoId"='${id}' AND "productoId"='${vieja.productoId}'; SELECT to_json(true);`);
    assert.equal((await llamada(colaboradores[0].contexto,`/inventario/conteos/${id}/lineas/${vieja.productoId}?resumen=true`,'PATCH',{stockFisico:7})).status,409);
    const nueva=(await llamada(colaboradores[1].contexto,`/inventario/compartidos/${id}/asignar`,'POST',{})).body.data;
    assert.equal(nueva.productoId,vieja.productoId);
    assert.equal((await llamada(colaboradores[1].contexto,`/inventario/compartidos/${id}/asignar?liberar=true`,'POST',{})).status,201);
    mkdirSync('.local/pruebas-ui',{recursive:true});
    const page=await colaboradores[0].contexto.newPage(); page.on('pageerror',e=>errores.push(e.message));
    await page.goto(base); await page.waitForURL(base+'/inventario');
    await page.getByText('Inventario general · en curso',{exact:true}).first().click();
    await page.getByRole('progressbar',{name:'Progreso del conteo'}).waitFor();
    await page.getByRole('button',{name:'Tomar siguiente producto',exact:true}).click();
    await page.getByLabel('Cantidad contada').fill('0');
    const escritura=page.waitForResponse(r=>r.url().includes('/lineas/') && r.request().method()==='PATCH');
    await page.getByRole('button',{name:'Guardar cantidad',exact:true}).click();
    assert.equal((await escritura).status(),200);
    await page.getByText('Cantidad guardada. Puedes tomar el siguiente producto.',{exact:true}).waitFor();
    await page.reload(); await page.getByText('Inventario general · en curso',{exact:true}).first().click();
    await page.getByText('4/',{exact:false}).first().waitFor();
    await page.screenshot({path:'.local/pruebas-ui/conteo-colaborador-390.png'});
    await page.getByRole('heading',{name:'Conteos disponibles',exact:true}).scrollIntoViewIfNeeded();
    assert.ok(await page.getByRole('heading',{name:'Conteos disponibles',exact:true}).isVisible(),'El historial debe alcanzarse desplazando la pantalla');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    const panel=await admin.newPage(); panel.on('pageerror',e=>errores.push(e.message));
    await panel.goto(base+'/admin/inventario'); await panel.getByText('Conteo guiado',{exact:true}).first().click();
    await panel.getByRole('button',{name:'Inventario general',exact:true}).waitFor();
    await panel.getByRole('button',{name:'Conteo diario · 5 productos',exact:true}).waitFor();
    await panel.getByText('Inventario general · en curso',{exact:true}).first().click();
    await panel.getByRole('progressbar',{name:'Progreso del conteo'}).waitFor();
    await panel.screenshot({path:'.local/pruebas-ui/conteo-administrador-1440.png'});
    const progreso=panel.getByRole('progressbar',{name:'Progreso del conteo'});
    const anterior=Number(await progreso.getAttribute('value'));
    const remota=(await llamada(colaboradores[1].contexto,`/inventario/compartidos/${id}/asignar`,'POST',{})).body.data;
    assert.equal((await llamada(colaboradores[1].contexto,`/inventario/conteos/${id}/lineas/${remota.productoId}?resumen=true`,'PATCH',{stockFisico:5})).status,200);
    await panel.waitForFunction(valor=>Number(document.querySelector('[aria-label="Progreso del conteo"]').value)===valor,anterior+1);
    assert.equal(sql(`SELECT count(*) FROM "conteoLineas" WHERE "conteoId"='${id}' AND "stockFisico" IS NOT NULL;`),anterior+1);

    await panel.getByRole('button',{name:/Corregir cantidad de/}).first().click();
    await panel.getByLabel('Cantidad contada').fill('6');
    const correccion=panel.waitForResponse(r=>r.url().includes('/lineas/') && r.request().method()==='PATCH');
    await panel.getByRole('button',{name:'Guardar cantidad',exact:true}).click();
    const respuestaCorreccion=await correccion; assert.equal(respuestaCorreccion.status(),200);
    const datosCorreccion=respuestaCorreccion.request().postDataJSON(); const rutaCorreccion=new URL(respuestaCorreccion.url()).pathname.replace('/api/v1','');
    assert.equal((await llamada(admin,rutaCorreccion+'?resumen=true','PATCH',{...datosCorreccion,stockFisico:999})).status,409,'Una corrección con lectura anterior no puede sobrescribir otra');
    assert.equal(sql(`SELECT count(*) FROM "participantesConteo" WHERE "conteoId"='${id}';`),4,'Se mantienen los tres colaboradores aunque corrija el administrador');
    // Confirmar sin duplicar la participación y conservar el precio observado.
    const documento=(await llamada(admin,`/inventario/conteos/${id}`)).body.data;
    for(const l of documento.lineas.filter(l=>l.stockFisico===null)) assert.equal((await llamada(admin,`/inventario/conteos/${id}/lineas/${l.productoId}?resumen=true`,'PATCH',{stockFisico:l.stockTeorico})).status,200);
    assert.equal((await llamada(admin,`/inventario/conteos/${id}/finalizar`,'POST',{})).status,201);
    const cerrado=(await llamada(admin,`/inventario/compartidos/${id}`)).body.data;
    assert.equal(cerrado.contadas,cerrado.total); assert.equal(cerrado.colaboradores,4); assert.ok(cerrado.finalizadoEn);
    assert.equal((await llamada(colaboradores[0].contexto,`/inventario/compartidos/${id}/lineas`)).status,403);
    const diario=(await llamada(admin,'/inventario/compartidos','POST',{tipo:'aleatorio',turno:'Prueba diaria'})).body.data;
    assert.equal((await llamada(admin,`/inventario/compartidos/${diario.id}`)).body.data.total,5);
    assert.equal((await llamada(admin,'/inventario/compartidos','POST',{tipo:'aleatorio',turno:'Otro celular'})).body.data.id,diario.id);
    assert.deepEqual(errores,[]);
    console.log('✓ Tres colaboradores concurrentes: asignaciones distintas, guardado y cero persistentes, exclusión de sobrescrituras, vencimiento, permisos, paginación, progreso, historial y vistas 390/1440');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
