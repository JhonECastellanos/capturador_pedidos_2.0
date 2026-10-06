// Chrome y respuestas controladas: no usa claves ni llama a proveedores externos.
const assert = require('node:assert/strict');
const {createServer}=require('node:http');
const {once}=require('node:events');
const {readFile,mkdir,writeFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {chromium}=require('playwright');
async function main(){
 const raiz=resolve('Frontend/dist');
 const servidor=createServer(async(req,res)=>{
  const ruta=resolve(raiz,'.'+new URL(req.url,'http://localhost').pathname);
  if(!ruta.startsWith(raiz+'/') && !ruta.startsWith(raiz+'\\')){res.writeHead(403);return res.end();}
  const archivo=/\.(js|css|svg|png|ico|woff2)$/.test(ruta)?ruta:resolve(raiz,'index.html');
  try{res.setHeader('Content-Type',archivo.endsWith('.js')?'text/javascript':archivo.endsWith('.css')?'text/css':archivo.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(archivo));}catch{res.writeHead(404);res.end();}
 });
 servidor.listen(0,'127.0.0.1');await once(servidor,'listening');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const contexto=await browser.newContext({viewport:{width:1440,height:900}}), pagina=await contexto.newPage();
 const nombres=['modelo-verde','modelo-diario','modelo-minuto','modelo-rojo','modelo-ocupado'];
 const estados=['disponible','cuota-agotada','temporal','no-disponible','temporal'];
 const mensajes=['Respondió correctamente.','Cuota diaria agotada.','Límite por minuto alcanzado.','Modelo sin acceso.','Servicio temporalmente ocupado.'];
 const config={proveedor:'gemini',modelo:'modelo-verde',urlBase:'',tieneClave:true,vozHabilitada:false,confirmacionVoz:true,responderConVoz:false};
 let guardados=0, llamadas=0, retardo=false;
 const errores=[];pagina.on('pageerror',e=>errores.push(e.message));
 try{
  await pagina.route('**/api/v1/**',async ruta=>{
   const req=ruta.request(), path=new URL(req.url()).pathname, datos=req.method()==='POST'||req.method()==='PUT'?req.postDataJSON():null;
   let cuerpo={data:[]};
   if(path.endsWith('/auth/me'))cuerpo={data:{id:'administrador-prueba',nombre:'Pruebas de modelos',rol:'administrador',activo:true,permisos:{}}};
   else if(path.endsWith('/asistente/configuracion')){if(req.method()==='PUT'){guardados++;config.modelo=datos.modelo;}cuerpo={data:config};}
   else if(path.endsWith('/asistente/preferencias'))cuerpo={data:config};
   else if(path.endsWith('/sincronizacion/revision'))cuerpo={data:{revision:'prueba'}};
   else if(path.endsWith('/asistente/modelos'))cuerpo={data:nombres};
   else if(path.endsWith('/asistente/conexion')){
    llamadas++;const i=nombres.indexOf(datos.modelo);assert.ok(i>=0,'Se envía el nombre real, sin el icono');
    if(retardo && i>0)await new Promise(r=>setTimeout(r,600));
    cuerpo={data:{modelo:datos.modelo,disponible:i===0,estado:estados[i],mensaje:mensajes[i],comprobadoEn:new Date().toISOString()}};
   }
   await ruta.fulfill({json:cuerpo});
  });
  await pagina.goto(`http://localhost:${servidor.address().port}/admin/configuracion`);
  await pagina.getByRole('button',{name:'Consultar modelos disponibles',exact:true}).click();
  await pagina.getByText('Revisión terminada:',{exact:false}).waitFor();
  const selector=pagina.getByRole('combobox',{name:'Modelos disponibles',exact:true});
  const opciones=await selector.locator('option').allTextContents();
  assert.ok(opciones.some(t=>t.includes('🟢 Respondió')&&t.includes('modelo-verde')));
  assert.ok(opciones.some(t=>t.includes('🟡 Cuota diaria agotada')&&t.includes('modelo-diario')));
  assert.ok(opciones.some(t=>t.includes('🟡 Temporalmente')&&t.includes('modelo-minuto')));
  assert.ok(opciones.some(t=>t.includes('🔴')&&t.includes('modelo-rojo')));
  assert.ok(opciones.some(t=>t.includes('🟡 Temporalmente')&&t.includes('modelo-ocupado')));
  assert.equal(guardados,0);assert.equal(llamadas,5);
  await selector.selectOption('modelo-verde');
  await pagina.getByRole('button',{name:'Guardar configuración',exact:true}).click();
  await pagina.getByText('Configuración guardada.',{exact:true}).waitFor();assert.equal(guardados,1);
  retardo=true;
  await pagina.getByRole('button',{name:'Consultar modelos disponibles',exact:true}).click();
  await selector.locator('option[value="modelo-verde"]').getByText('🟢 Respondió',{exact:false}).waitFor({state:'attached'});
  assert.equal(await selector.isDisabled(),false,'Puede elegir mientras continúa la revisión');
  await selector.selectOption('modelo-verde');
  await pagina.getByRole('button',{name:'Detener comprobación',exact:true}).click();
  await pagina.waitForTimeout(700);
  assert.match(await selector.locator('option[value="modelo-verde"]').textContent(),/🟢/);
  assert.match(await selector.locator('option[value="modelo-diario"]').textContent(),/⚪ Sin comprobar/);
  await pagina.getByRole('textbox',{name:'Clave de API',exact:true}).fill('clave-ficticia-de-otra-conexion');
  assert.match(await selector.locator('option[value="modelo-verde"]').textContent(),/⚪ Sin comprobar/);
  await pagina.setViewportSize({width:390,height:844});
  assert.ok(await pagina.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir('.local/pruebas-ui',{recursive:true});
  await pagina.screenshot({path:'.local/pruebas-ui/modelos-movil.png',fullPage:true});
  assert.deepEqual(errores,[]);
  const informe={fecha:new Date().toISOString(),alcance:'Chrome real con respuestas controladas, sin llamadas externas',casos:['Estados y colores en cada opción','Nombre real al guardar','Elegir mientras continúa la revisión','Detener sin pintar respuestas tardías','Cambiar clave invalida los resultados','Móvil sin desborde'],errores};
  await writeFile('.local/pruebas-ui/modelos.json',JSON.stringify(informe,null,2));console.log(JSON.stringify(informe,null,2));
 }finally{await contexto.close();await browser.close();servidor.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
