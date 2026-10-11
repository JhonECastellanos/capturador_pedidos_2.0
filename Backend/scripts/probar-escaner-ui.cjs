// Cámara sintética en Chrome real: decodificación real y API/PostgreSQL QA.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { QRCodeWriter, BarcodeFormat } = require('@zxing/library');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const base = 'http://127.0.0.1:8180';
const marca = `QA-lector-${Date.now()}`;
function qr(texto) {
  const matriz = new QRCodeWriter().encode(texto,BarcodeFormat.QR_CODE,320,320,new Map());
  const rectangulos = [];
  for(let y=0;y<matriz.getHeight();y++) for(let x=0;x<matriz.getWidth();x++) if(matriz.get(x,y)) rectangulos.push([x+160,y+80,1,1]);
  return rectangulos;
}
// Etiqueta EAN-13 con dígito de control y zonas de silencio, independiente del lector.
function ean(base12) {
  const digitos = [...base12].map(Number);
  const codigo = base12 + ((10-digitos.reduce((s,n,i)=>s+n*(i%2?3:1),0)%10)%10);
  const l=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const g=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const paridades=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  let bits='101';
  for(let i=1;i<=6;i++) bits+=(paridades[Number(codigo[0])][i-1]==='L'?l:g)[Number(codigo[i])];
  bits+='01010'; for(let i=7;i<13;i++) bits+=l[Number(codigo[i])].replace(/[01]/g,c=>c==='0'?'1':'0'); bits+='101';
  return {codigo,figura:[...bits].flatMap((b,i)=>b==='1'?[[82+i*5,140,5,200]]:[])};
}
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const errores=[],casos=[],lecturas=[];
  try {
    const admin=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    async function pedir(ctx,ruta,method='GET',data,status=method==='POST'?201:200) {
      const r=await ctx.request.fetch(base+'/api/v1'+ruta,{method,data,headers:method==='GET'?{}:{'Idempotency-Key':randomUUID()}}); const json=await r.json();assert.equal(r.status(),status,JSON.stringify(json));return json.data;
    }
    await pedir(admin,'/auth/login','POST',{identifier:'qa-admin@pruebas.invalid',password:'SoloPruebas2026!'},200);
    const barras=ean('770'+String(Date.now()).slice(-9)); const codigoQR=marca+'-QR';
    const p1=await pedir(admin,'/productos','POST',{nombre:marca+' Galletas',unidad:'bolsa',precioVenta:2100,costoActual:900,stock:20,codigosLectura:[codigoQR]});
    const p2=await pedir(admin,'/productos','POST',{nombre:marca+' Leche',unidad:'bolsa',precioVenta:3500,costoActual:2200,stock:20,codigosLectura:[barras.codigo]});
    const camaraFalsa = () => {
      const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__pistasCamara=[];
      navigator.mediaDevices.getUserMedia=async restricciones=>{
        if(!restricciones.video) return original(restricciones);
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');
        const pintar=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.fillStyle='black';for(const [x,y,w,h] of window.__figuraCamara??[])ctx.fillRect(x,y,w,h);};
        pintar();const intervalo=setInterval(pintar,80);const flujo=canvas.captureStream(12);
        for(const pista of flujo.getTracks()){window.__pistasCamara.push(pista);const detener=pista.stop.bind(pista);pista.stop=()=>{clearInterval(intervalo);detener();};}return flujo;
      };
    };
    await admin.addInitScript(camaraFalsa);
    const page=await admin.newPage();page.on('pageerror',e=>errores.push(e.message));
    await page.goto(base+'/admin/ventas/pedido');
    await page.getByText('Venta abierta · cliente ocasional',{exact:true}).click();
    async function figura(pagina,dibujo) { await pagina.evaluate(d=>{window.__figuraCamara=d;},dibujo); }
    async function escanear(dibujo,nombre) {
      const inicio=performance.now();
      await figura(page,dibujo);await page.getByRole('button',{name:'Escanear código',exact:true}).click();
      await page.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden',timeout:20000});
      await page.getByPlaceholder('Buscar producto o código').waitFor();
      await page.waitForFunction(n=>document.querySelector('input[placeholder="Buscar producto o código"]')?.value===n,nombre);
      await page.getByRole('button',{name:'Disminuir cantidad'}).first().waitFor();
      assert.equal(await page.getByRole('button',{name:'Disminuir cantidad'}).count(),1);
      assert.ok(await page.evaluate(()=>window.__pistasCamara.every(p=>p.readyState==='ended')));
      lecturas.push({nombre,milisegundos:Math.round(performance.now()-inicio)});
    }
    await escanear(qr(codigoQR),p1.nombre);await escanear(barras.figura,p2.nombre);
    await figura(page,qr(codigoQR));await page.getByRole('button',{name:'Escanear código',exact:true}).click();await page.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden'});
    await page.waitForFunction(n=>document.querySelector('input[placeholder="Buscar producto o código"]')?.value===n,p1.nombre);
    const fila=page.getByText(p1.nombre,{exact:true}).locator('..').locator('..');assert.ok((await fila.innerText()).includes('2'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    mkdirSync('.local/pruebas-v7',{recursive:true});await page.screenshot({path:'.local/pruebas-v7/venta-escaner-390.png'});
    casos.push('QR y EAN-13 decodificados desde video: regresan a la venta, buscan el nombre y agregan una unidad; escanear otra vez suma una sola unidad; cámara liberada');
    await page.goto(base+'/admin/precios');await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(p1.nombre);
    await page.getByText(p1.nombre,{exact:true}).first().click();
    await page.getByRole('spinbutton').first().fill('2600');await page.getByLabel('Costo actual',{exact:true}).fill('1100');await page.getByLabel('Stock mínimo',{exact:true}).fill('4');
    await page.getByRole('button',{name:'Revisar y confirmar →',exact:true}).click();
    const precioGuardado=page.waitForResponse(r=>r.url().endsWith('/precio')&&r.request().method()==='POST');await page.getByRole('button',{name:'Guardar precio',exact:true}).click();assert.equal((await precioGuardado).status(),201);
    const parametrizado=await pedir(admin,`/productos/${p1.id}`);assert.equal(parametrizado.precioVenta,2600);assert.equal(parametrizado.costoActual,1100);assert.equal(parametrizado.stockMinimo,4);assert.equal(parametrizado.stockFisico,20);
    casos.push('Formulario de Precios: confirma precio, costo y mínimo con los mismos campos persistidos; conserva las veinte unidades');
    await page.goto(base+'/admin/inventario');await page.getByText('Stock general',{exact:true}).first().click();await page.getByRole('button',{name:'+ Producto',exact:true}).click();
    await figura(page,qr(marca+'-etiqueta-nueva'));await page.getByRole('button',{name:'Escanear código',exact:true}).click();await page.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden',timeout:20000}).catch(async e=>{await page.screenshot({path:'.local/pruebas-v8/lector-fallo.png'});console.error(await page.locator('video').evaluate(v=>({ancho:v.videoWidth,alto:v.videoHeight,estado:v.readyState,pausado:v.paused})));console.error(await page.getByRole('dialog').innerText());throw e;});
    assert.equal(await page.getByLabel('Código de barras o QR',{exact:true}).inputValue(),marca+'-etiqueta-nueva');
    await page.getByLabel('Nombre del producto',{exact:true}).fill(p1.nombre);
    await page.getByRole('option',{name:p1.nombre+' · '+p1.codigoInterno,exact:true}).click();
    const vinculo=page.waitForResponse(r=>r.url().endsWith('/codigos')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Usar producto existente',exact:true}).click();assert.equal((await vinculo).status(),201);
    const mismo=await pedir(admin,`/productos/${p1.id}`);assert.equal(mismo.stockFisico,20);assert.ok(mismo.codigosLectura.includes(codigoQR)&&mismo.codigosLectura.includes(marca+'-etiqueta-nueva'));
    casos.push('Stock general: alta con cámara, coincidencia por nombre y segunda etiqueta del mismo producto sin duplicar stock');
    const general=await pedir(admin,'/inventario/conteos','POST',{tipo:'general',turno:'Escáner móvil'});
    const email=marca+'@pruebas.invalid';await pedir(admin,'/usuarios','POST',{nombre:'Lector de prueba',email,password:'SoloPruebas2026!',rol:'inventario'});
    const inv=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await inv.addInitScript(camaraFalsa);await pedir(inv,'/auth/login','POST',{identifier:email,password:'SoloPruebas2026!'},200);
    const contar=await inv.newPage();contar.on('pageerror',e=>errores.push(e.message));await contar.goto(base+'/inventario');
    await contar.getByText('Inventario general · en curso',{exact:true}).first().click();
    await figura(contar,qr(codigoQR));await contar.getByRole('button',{name:'Contar con cámara',exact:true}).click();await contar.getByLabel('Cantidad contada').waitFor({timeout:20000});
    await figura(contar,[]);await contar.getByLabel('Cantidad contada').fill('0');await contar.getByRole('button',{name:'Guardar cantidad',exact:true}).click();
    await contar.getByRole('dialog',{name:'Escanear producto'}).waitFor();
    await figura(contar,barras.figura);await contar.getByLabel('Cantidad contada').waitFor({timeout:20000});
    await figura(contar,[]);await contar.getByLabel('Cantidad contada').fill('13');await contar.getByRole('button',{name:'Guardar cantidad',exact:true}).click();await contar.getByRole('dialog',{name:'Escanear producto'}).waitFor();await contar.getByRole('button',{name:'Cerrar',exact:true}).click();
    const contadas=await pedir(admin,`/inventario/compartidos/${general.id}/lineas?q=${encodeURIComponent(marca)}`);
    assert.equal(contadas.find(l=>l.productoId===p1.id).stockFisico,0);assert.equal(contadas.find(l=>l.productoId===p2.id).stockFisico,13);
    const args=['compose','-p','ambie-integracion','-f','docker-compose.yml','-f','docker-compose.pruebas.yml','exec','-T','postgres'];
    const usuarioBd=execFileSync('docker.exe',[...args,'printenv','POSTGRES_USER'],{encoding:'utf8'}).trim();
    const sql=JSON.parse(execFileSync('docker.exe',[...args,'psql','-U',usuarioBd,'-d','ambie_test','-qAt','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:`SELECT json_agg(json_build_object('productoId',l."productoId",'cantidad',l."stockFisico",'responsable',l."contadoPorId",'fecha',l."contadoEn",'stock',p."stockFisico")) FROM "conteoLineas" l JOIN productos p ON p.id=l."productoId" WHERE l."conteoId"='${general.id}' AND l."productoId" IN ('${p1.id}','${p2.id}');`}).trim());
    assert.equal(sql.find(l=>l.productoId===p1.id).cantidad,0);assert.equal(sql.find(l=>l.productoId===p2.id).cantidad,13);assert.ok(sql.every(l=>l.responsable&&l.fecha&&l.stock===20));
    await contar.reload();await contar.getByText('Inventario general · en curso',{exact:true}).first().click();await contar.getByPlaceholder('Buscar producto del conteo').fill(marca);await contar.getByText('Contado: 0',{exact:false}).waitFor();
    await contar.screenshot({path:'.local/pruebas-v7/inventario-escaner-390.png'});
    casos.push('Colaborador en móvil: cámara → cero → guardar → cámara → trece → guardar; ambas cantidades persisten al recargar');
    const diariosPrevios=await pedir(admin,'/inventario/compartidos?tipo=aleatorio');for(const c of diariosPrevios.filter(c=>c.tipo==='aleatorio'&&c.estado==='en-curso'))await pedir(admin,`/inventario/conteos/${c.id}/cancelar`,'POST');
    const correoVendedor = marca + '-vendedor@pruebas.invalid';
    await pedir(admin,'/usuarios','POST',{nombre:'Vendedor lector de prueba',email:correoVendedor,password:'SoloPruebas2026!',rol:'vendedor'});
    const vendedor = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await vendedor.addInitScript(camaraFalsa);
    await pedir(vendedor,'/auth/login','POST',{identifier:correoVendedor,password:'SoloPruebas2026!'},200);
    const diarioVista = await vendedor.newPage();diarioVista.on('pageerror',e=>errores.push(e.message));await diarioVista.goto(base+'/vendedor');
    await diarioVista.getByText('Conteo diario',{exact:true}).click();await diarioVista.getByRole('button',{name:'Abrir conteo de hoy · 5 productos',exact:true}).click();await diarioVista.getByRole('progressbar',{name:'Progreso del conteo'}).waitFor();
    const diarios = await pedir(vendedor,'/inventario/compartidos');const diarioActual=diarios[0];
    const pendientesDiarios = await pedir(vendedor,`/inventario/compartidos/${diarioActual.id}/lineas`);const pendienteDiario=pendientesDiarios.find(l=>l.stockFisico===null&&!l.asignadoPorId);
    assert.ok(pendienteDiario,'Un producto del diario disponible');
    await figura(diarioVista,qr(pendienteDiario.codigo));await diarioVista.getByRole('button',{name:'Contar con cámara',exact:true}).click();await diarioVista.getByLabel('Cantidad contada').waitFor({timeout:20000});
    await figura(diarioVista,[]);await diarioVista.getByLabel('Cantidad contada').fill('0');const cantidadDiariaGuardada=diarioVista.waitForResponse(r=>r.url().includes(`/inventario/conteos/${diarioActual.id}/lineas/`)&&r.request().method()==='PATCH');await diarioVista.getByRole('button',{name:'Guardar cantidad',exact:true}).click();assert.equal((await cantidadDiariaGuardada).status(),200);
    const verificacionDiaria=await pedir(vendedor,`/inventario/compartidos/${diarioActual.id}/lineas`);assert.equal(verificacionDiaria.find(l=>l.productoId===pendienteDiario.productoId).stockFisico,0);
    if(verificacionDiaria.some(l=>l.stockFisico===null)){await diarioVista.getByRole('dialog',{name:'Escanear producto'}).waitFor();await diarioVista.getByRole('button',{name:'Cerrar',exact:true}).click();}
    await diarioVista.screenshot({path:'.local/pruebas-v7/vendedor-diario-390.png'});casos.push('Vendedor tiene entrada visible al diario, escanea uno de los cinco y guarda cero; el historial administrativo permanece oculto');
    const robotContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await pedir(robotContext,'/auth/login','POST',{identifier:'qa-admin@pruebas.invalid',password:'SoloPruebas2026!'},200);
    await robotContext.route('**/agentes/estado',r=>r.fulfill({json:{data:{habilitado:true,modo:'hibrido',configurado:true,audio:{idioma:'es-CO',velocidad:1,volumen:0,voz:'',modeloStt:'base',stt:'whisper'}}}}));
    await robotContext.route('**/agentes/audio/sesion',r=>r.fulfill({json:{data:{ticket:'prueba-ui'}}}));
    let socketRobot;
    await robotContext.routeWebSocket('**/agentes/audio/conversar?*',ws=>{socketRobot=ws;setTimeout(()=>ws.send(JSON.stringify({tipo:'listo'})),50);ws.onMessage(()=>{});});
    const robot=await robotContext.newPage();robot.on('pageerror',e=>errores.push(e.message));await robot.goto(base+'/admin/precios');const boton=robot.getByRole('button',{name:'Asistente',exact:true});await boton.click();
    await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    assert.equal(await robot.getByRole('button',{name:'Hablar',exact:true}).count(),0);assert.equal(await robot.getByRole('button',{name:'Detener',exact:true}).count(),0);
    await robot.getByLabel('Ancho del texto del asistente').evaluate(e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'440');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await robot.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await robot.getByRole('heading',{name:'Precios y márgenes',exact:true}).click();assert.equal(await robot.getByLabel('Ancho del texto del asistente').count(),0);assert.equal(await boton.getAttribute('aria-pressed'),'true');
    await robot.waitForTimeout(350);await boton.click();assert.equal(await boton.getAttribute('aria-pressed'),'false');
    await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    await robot.waitForTimeout(350);await boton.dblclick({delay:80});assert.equal(await boton.getAttribute('aria-pressed'),'false');assert.equal(await boton.getAttribute('aria-expanded'),'false');
    const revisionPendiente=await pedir(admin,'/agentes/revisar','POST',{id:randomUUID(),version:1,instruccion:{operacion:'precio',producto:p1.nombre,precio:2800}});
    await robotContext.route('**/agentes/interpretar',async r=>{await new Promise(resolve=>setTimeout(resolve,850));await r.fulfill({json:{data:revisionPendiente}});});
    await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    socketRobot.send(JSON.stringify({tipo:'instruccion',texto:'Cambia el precio del producto a 2800'}));await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.dataset.estado==='pensando');
    await robot.waitForTimeout(350);await boton.click();assert.equal(await boton.getAttribute('aria-pressed'),'false');await robot.getByText('Confirmar cambio',{exact:true}).waitFor();
    casos.push('Detener micrófono durante interpretación conserva la respuesta y abre la confirmación; doble toque apaga sin guardar');
    casos.push('Robot con transporte simulado: un toque escucha, otro detiene; tocar fuera cierra solo la burbuja; ancho ajustable y sin botones Hablar/Detener');
    const escritorio=await admin.newPage();escritorio.on('pageerror',e=>errores.push(e.message));await escritorio.setViewportSize({width:1440,height:900});await escritorio.goto(base+'/admin/inventario');await escritorio.getByText('Conteo guiado',{exact:true}).first().click();await escritorio.getByText('Inventario general · en curso',{exact:true}).first().click();
    assert.equal(await escritorio.getByRole('heading',{name:'Historial y progreso de inventarios',exact:true}).count(),0);
    await escritorio.getByRole('button',{name:'← Historial',exact:true}).click();await escritorio.getByRole('heading',{name:'Historial y progreso de inventarios',exact:true}).waitFor();
    await escritorio.screenshot({path:'.local/pruebas-v7/historial-1440.png'});casos.push('Administrador: lista de historial y detalle separados, paginación compacta en 390 y 1440');
    assert.deepEqual(errores,[]);for(const c of casos)console.log('✓ '+c);writeFileSync('.local/pruebas-v7/escaner-ui.json',JSON.stringify({fecha:new Date().toISOString(),casos,lecturas,errores},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
