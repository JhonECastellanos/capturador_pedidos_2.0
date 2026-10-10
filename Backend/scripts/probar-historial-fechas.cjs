const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
assert.equal(base, 'http://localhost:8180', 'Solo QA');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 assert.equal((await context.request.post(base+'/api/v1/auth/login',{data:{identifier:'qa-admin@pruebas.invalid',password:'SoloPruebas2026!'}})).status(),200);
 const productoRes=await context.request.post(base+'/api/v1/productos',{data:{nombre:'QA-Fechas-'+Date.now(),precioVenta:1000,stock:20}});assert.equal(productoRes.status(),201);const producto=(await productoRes.json()).data;
 const args=['compose','-p','ambie-integracion','-f','docker-compose.yml','-f','docker-compose.pruebas.yml','exec','-T','postgres'];
 const usuario=execFileSync('docker.exe',[...args,'printenv','POSTGRES_USER'],{encoding:'utf8'}).trim();
 const sql=consulta=>execFileSync('docker.exe',[...args,'psql','-U',usuario,'-d','ambie_test','-qAt','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:consulta}).trim();
 const pedidos=[];
 for(const dias of [0,1,2,7]){
  const respuesta=await context.request.post(base+'/api/v1/pedidos',{data:{clienteId:null,metodo:'efectivo',estadoInicial:'entregado',lineas:[{productoId:producto.id,cantidad:1}]}});assert.equal(respuesta.status(),201);const p=(await respuesta.json()).data;
  assert.match(p.id,/^[0-9a-f-]{36}$/i);
  if(dias)sql(`UPDATE pedidos SET "fechaOperacion"=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date-${dias},"creadoEn"=CURRENT_TIMESTAMP-INTERVAL '${dias} days' WHERE id='${p.id}';`);
  const fecha=sql(`SELECT "fechaOperacion" FROM pedidos WHERE id='${p.id}';`);
  const filtrado=await context.request.get(base+`/api/v1/pedidos?segmento=historial&desde=${fecha}&hasta=${fecha}&q=${p.numero}`);
  assert.equal(filtrado.status(),200);assert.equal((await filtrado.json()).data[0].id,p.id);pedidos.push({...p,dias,fecha});
 }
 const page=await context.newPage(),errores=[];page.on('pageerror',e=>errores.push(e.message));
 await page.goto(base+'/admin/pedidos');await page.getByRole('status').filter({hasText:'Historial completo'}).waitFor();
 for(const pedido of pedidos){
  await page.getByPlaceholder('Buscar por cliente o consecutivo').fill(pedido.numero);
  const tarjeta=page.locator('.lista-pedidos button').filter({hasText:pedido.numero});await tarjeta.waitFor();await tarjeta.click();
  await page.getByRole('region',{name:'Detalle de productos'}).waitFor();await page.getByRole('button',{name:'Volver',exact:true}).click();
 }
 await page.getByPlaceholder('Buscar por cliente o consecutivo').fill('');
 const respuestaHoy=page.waitForResponse(r=>r.url().includes('/pedidos?segmento=hoy')&&r.status()===200);
 await page.getByRole('button',{name:'HOY',exact:true}).click();const soloHoy=(await (await respuestaHoy).json()).data;
 assert.ok(!soloHoy.some(p=>pedidos.filter(x=>x.dias).some(x=>x.id===p.id)));
 await page.getByRole('button',{name:'HISTORIAL',exact:true}).click();await page.getByRole('status').filter({hasText:'Historial completo'}).waitFor();
 assert.deepEqual(errores,[]);
 const informe={fecha:new Date().toISOString(),pedidosVerificados:pedidos.map(p=>({numero:p.numero,diasAnteriores:p.dias,fecha:p.fecha})),historialInicial:true,filtroHoyExcluyeAnteriores:true,errores};
 writeFileSync('.local/pruebas-ui/historial-fechas.json',JSON.stringify(informe,null,2));console.log(JSON.stringify(informe,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
