const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { writeFileSync, mkdirSync } = require('node:fs');
const base = process.env.BASE_PRUEBAS_UI || 'http://localhost:8180';
assert.equal(base, 'http://localhost:8180', 'Solo se permite QA');
const args = ['compose','-p','ambie-integracion','-f','docker-compose.yml','-f','docker-compose.pruebas.yml','exec','-T','postgres'];
const user = execFileSync('docker.exe',[...args,'printenv','POSTGRES_USER'],{encoding:'utf8'}).trim();
const sql = consulta => JSON.parse(execFileSync('docker.exe',[...args,'psql','-U',user,'-d','ambie_test','-qAt','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:consulta}).trim());
const marca = 'QA-Descuadres-'+Date.now();
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Bogota'});
  assert.equal((await ctx.request.post(base+'/api/v1/auth/login',{data:{identifier:'qa-admin@pruebas.invalid',password:'SoloPruebas2026!'}})).status(),200);
  async function api(ruta,method='GET',data){const r=await ctx.request.fetch(base+'/api/v1'+ruta,{method,...(data?{data}:{})});const body=await r.json();assert.ok(r.ok(),JSON.stringify({ruta,status:r.status(),body}));return body.data;}
  const hoy=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
  const resumen=()=>api('/dashboard/resumen?desde='+hoy+'&hasta='+hoy);
  const antes=await resumen();
  const a=await api('/productos','POST',{nombre:marca+' faltante',precioVenta:500,costoActual:100,stock:10});
  const b=await api('/productos','POST',{nombre:marca+' sobrante',precioVenta:500,costoActual:250,stock:10});
  const conteo=await api('/inventario/conteos','POST',{tipo:'general',turno:marca});
  for(const [producto,stock] of [[a,8],[b,13]]) await api(`/inventario/conteos/${conteo.id}/lineas/${producto.id}`,'PATCH',{stockFisico:stock});
  assert.deepEqual((await resumen()).descuadres,antes.descuadres,'Un borrador no registra descuadres confirmados');
  await api('/inventario/conteos/'+conteo.id+'/finalizar','POST',{});
  let confirmado=await resumen();assert.notEqual(confirmado.cache.version,antes.cache.version);assert.equal(confirmado.descuadres.faltantes-antes.descuadres.faltantes,200);assert.equal(confirmado.descuadres.sobrantes-antes.descuadres.sobrantes,750);
  assert.equal((await resumen()).cache.estado,'hit');
  await api('/inventario/conteos/'+conteo.id+'/aplicar-ajuste','POST',{});
  assert.deepEqual((await resumen()).descuadres,confirmado.descuadres,'Aplicar no contabiliza nuevamente el mismo conteo');
  await api('/productos/importar','POST',{prepararInicial:false,productos:[{codigoInterno:a.codigoInterno,nombre:a.nombre,precioVenta:500,costoActual:999}]});
  assert.deepEqual((await resumen()).descuadres,confirmado.descuadres,'Cambiar costos no revaloriza conteos anteriores');
  const manual=await api('/inventario/ajustes','POST',{productoId:a.id,stockFisico:7,motivo:'Pérdida',comentario:marca});
  const conManual=await resumen();assert.equal(conManual.descuadres.faltantes-confirmado.descuadres.faltantes,999);
  const diario=await api('/inventario/conteos','POST',{tipo:'aleatorio',turno:marca+' diario'});
  let costoDiario=0;
  if(diario.estado==='en-curso') {
   const lineaDiaria=diario.lineas.find(l=>l.stockTeorico>0);assert.ok(lineaDiaria);
   const productoDiario=await api('/productos/'+lineaDiaria.productoId);costoDiario=productoDiario.costoActual;
   for(const linea of diario.lineas) await api(`/inventario/conteos/${diario.id}/lineas/${linea.productoId}`,'PATCH',{stockFisico:linea.stockTeorico+(linea.productoId===lineaDiaria.productoId?-1:0)});
   await api('/inventario/conteos/'+diario.id+'/finalizar','POST',{});
  } else {assert.equal(diario.estado,'confirmado');}
  const conDiario=await resumen();assert.equal(conDiario.descuadres.faltantes-conManual.descuadres.faltantes,costoDiario);
  const cancelado=await api('/inventario/conteos','POST',{tipo:'general',turno:marca+' cancelado'});
  await api(`/inventario/conteos/${cancelado.id}/lineas/${a.id}`,'PATCH',{stockFisico:0});await api('/inventario/conteos/'+cancelado.id+'/cancelar','POST',{});
  assert.deepEqual((await resumen()).descuadres,conDiario.descuadres,'Un conteo cancelado queda fuera');
  // Fechas controladas solo de nuestros documentos QA: límites del día de Bogotá.
  sql(`UPDATE "conteosInventario" SET "finalizadoEn"='${hoy} 04:59:59' WHERE id='${conteo.id}'; SELECT to_json(true);`);
  const fechaAnterior=new Date(hoy+'T12:00:00Z');fechaAnterior.setUTCDate(fechaAnterior.getUTCDate()-1);const ayer=fechaAnterior.toISOString().slice(0,10);
  const previoDia=await api('/dashboard/resumen?desde='+ayer+'&hasta='+ayer);assert.ok(previoDia.descuadres.serie.some(f=>f.dia===ayer && f.faltantes>=200 && f.sobrantes>=750));
  sql(`UPDATE "conteosInventario" SET "finalizadoEn"='${hoy} 05:00:00' WHERE id='${conteo.id}'; SELECT to_json(true);`);
  assert.equal((await resumen()).descuadres.faltantes,conDiario.descuadres.faltantes);
  // Un registro anterior sin costo no se convierte artificialmente al costo vigente.
  const valores=sql(`SELECT json_agg(json_build_object('diferencia',diferencia,'costo',"costoUnitarioConteo")) FROM "conteoLineas" WHERE "conteoId"='${conteo.id}' AND "stockFisico" IS NOT NULL;`);assert.deepEqual(valores.sort((x,y)=>x.diferencia-y.diferencia),[{diferencia:-2,costo:100},{diferencia:3,costo:250}]);
  sql(`UPDATE "conteoLineas" SET "costoUnitarioConteo"=NULL WHERE "conteoId"='${conteo.id}' AND "productoId"='${b.id}'; SELECT to_json(true);`);
  const sinCosto=await resumen();assert.equal(sinCosto.descuadres.lineasSinCosto,conDiario.descuadres.lineasSinCosto+1);assert.equal(sinCosto.descuadres.sobrantes,conDiario.descuadres.sobrantes-750);
  sql(`UPDATE "conteoLineas" SET "costoUnitarioConteo"=250 WHERE "conteoId"='${conteo.id}' AND "productoId"='${b.id}'; SELECT to_json(true);`);
  const errores=[];let page=await ctx.newPage();page.on('pageerror',e=>errores.push(e.message));
  const periodos=[];
  for(const width of [390,1440]){
   if(width===1440){const escritorio=await browser.newContext({viewport:{width,height:844},timezoneId:'America/Bogota'});await escritorio.addCookies(await ctx.cookies());page=await escritorio.newPage();page.on('pageerror',e=>errores.push(e.message));}
   await page.setViewportSize({width,height:844});await page.goto(base+'/admin');const grafico=page.getByRole('region',{name:'Descuadres de inventario'});await grafico.waitFor();
   for(const periodo of ['Día','Semana','Mes','Año']){
    await grafico.getByRole('button',{name:periodo,exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[role=status]')).some(e=>e.textContent.includes('Actualizando periodo')));
    const ultimo=await ctx.request.get(base+'/api/v1/dashboard/resumen?desde='+hoy+'&hasta='+hoy);assert.equal(ultimo.status(),200);
    const barra=grafico.getByRole('button',{name:/: sobrantes /}).last();if(width===390)await barra.tap();else await barra.hover();await barra.getByRole('tooltip').waitFor({state:'visible'});
    assert.equal(await grafico.getByRole('button',{name:/: sobrantes /}).count(),{'Día':7,'Semana':8,'Mes':6,'Año':5}[periodo]);assert.ok(await grafico.getByText(/Faltantes .*sobrantes .*neto /).isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));periodos.push({width,periodo});
   }
   await grafico.scrollIntoViewIfNeeded();await page.screenshot({path:`.local/pruebas-ui/descuadres-${width}.png`});
  }
  await page.goto(base+'/admin');const seccion=page.getByRole('region',{name:'Descuadres de inventario'});await seccion.waitFor();const revisionPrev=await resumen();
  await api('/inventario/ajustes','POST',{productoId:a.id,stockFisico:6,motivo:'Pérdida',comentario:marca+' sincronización'});
   const actualizado=await resumen();const inicioGrafico=new Date(hoy+'T12:00:00Z');inicioGrafico.setUTCDate(inicioGrafico.getUTCDate()-6);
   const rangoGrafico=await api('/dashboard/resumen?desde='+inicioGrafico.toISOString().slice(0,10)+'&hasta='+hoy);
   await page.waitForFunction(valor=>document.querySelector('[aria-label="Descuadres de inventario"]').textContent.replace(/\s/g,'').includes('Faltantes$'+new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(valor)),rangoGrafico.descuadres.faltantes);assert.notEqual(actualizado.cache.version,revisionPrev.cache.version);
  assert.deepEqual(errores,[]);mkdirSync('.local/pruebas-ui',{recursive:true});const informe={fecha:new Date().toISOString(),conteoId:conteo.id,diarioId:diario.id,manual,importesConfirmados:{faltantes:200,sobrantes:750,ajusteManual:999},sinDuplicarAlAplicar:true,costosHistoricos:true,limiteBogota:true,canceladosExcluidos:true,sinCostoInformado:true,periodos,errores};writeFileSync('.local/pruebas-ui/descuadres-tablero.json',JSON.stringify(informe,null,2));console.log(JSON.stringify(informe,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
