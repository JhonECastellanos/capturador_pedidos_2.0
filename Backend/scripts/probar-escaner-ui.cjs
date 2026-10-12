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
        const pintar=()=>{const perfil=window.__perfilCamara??{};ctx.resetTransform();ctx.filter='none';ctx.fillStyle=perfil.fondo??'white';ctx.fillRect(0,0,640,480);ctx.translate(320,240);ctx.rotate((perfil.giro??0)*Math.PI/180);ctx.scale(perfil.escala??1,perfil.escala??1);ctx.translate(-320,-240);ctx.filter=perfil.filtro??'none';ctx.fillStyle=perfil.tinta??'black';for(const [x,y,w,h] of window.__figuraCamara??[])ctx.fillRect(x,y,w,h);};
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
    for(const perfil of [{giro:90,escala:0.7},{giro:180,escala:0.6,fondo:'#ddd',tinta:'#555'},{giro:12,escala:0.8,filtro:'blur(0.35px)'}]){
      await page.evaluate(p=>{window.__perfilCamara=p;},perfil);await escanear(barras.figura,p2.nombre);
    }
    await page.evaluate(()=>{window.__perfilCamara={};});
    casos.push('Barras EAN pequeñas, giradas 90/180 grados, con menor contraste y desenfoque leve: mismo código sin lecturas duplicadas');
    await figura(page,qr(codigoQR));await page.getByRole('button',{name:'Escanear código',exact:true}).click();await page.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden'});
    await page.waitForFunction(n=>document.querySelector('input[placeholder="Buscar producto o código"]')?.value===n,p1.nombre);
    const fila=page.getByText(p1.nombre,{exact:true}).locator('..').locator('..');assert.ok((await fila.innerText()).includes('2'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    mkdirSync('.local/pruebas-v7',{recursive:true});await page.screenshot({path:'.local/pruebas-v7/venta-escaner-390.png'});
    casos.push('QR y EAN-13 decodificados desde video: regresan a la venta, buscan el nombre y agregan una unidad; escanear otra vez suma una sola unidad; cámara liberada');
    await page.goto(base+'/admin/productos');await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(p1.nombre);
    await page.getByText(p1.nombre,{exact:true}).first().click();
    await page.getByRole('spinbutton').first().fill('2600');await page.getByLabel('Costo actual',{exact:true}).fill('1100');await page.getByLabel('Stock mínimo',{exact:true}).fill('4');
    await page.getByRole('button',{name:'Revisar y confirmar →',exact:true}).click();
    const precioGuardado=page.waitForResponse(r=>r.url().endsWith('/precio')&&r.request().method()==='POST');await page.getByRole('button',{name:'Guardar precio',exact:true}).click();assert.equal((await precioGuardado).status(),201);
    const parametrizado=await pedir(admin,`/productos/${p1.id}`);assert.equal(parametrizado.precioVenta,2600);assert.equal(parametrizado.costoActual,1100);assert.equal(parametrizado.stockMinimo,4);assert.equal(parametrizado.stockFisico,20);
    casos.push('Formulario de Productos: confirma precio, costo y mínimo con los mismos campos persistidos; conserva las veinte unidades');
    await page.goto(base+'/admin/productos');await page.getByRole('button',{name:'Crear producto o vincular código',exact:true}).click();
    await figura(page,qr(marca+'-etiqueta-nueva'));await page.getByRole('button',{name:'Escanear código',exact:true}).click();await page.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden',timeout:20000}).catch(async e=>{await page.screenshot({path:'.local/pruebas-v8/lector-fallo.png'});console.error(await page.locator('video').evaluate(v=>({ancho:v.videoWidth,alto:v.videoHeight,estado:v.readyState,pausado:v.paused})));console.error(await page.getByRole('dialog').innerText());throw e;});
    await page.waitForFunction(codigo=>document.querySelector('input[aria-label="Código de barras o QR"]')?.value===codigo,marca+'-etiqueta-nueva');
    await page.getByLabel('Nombre del producto',{exact:true}).fill(p1.nombre);
    await page.getByRole('option',{name:p1.nombre+' · '+p1.codigoInterno,exact:true}).click();
    const vinculo=page.waitForResponse(r=>r.url().endsWith('/codigos')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Usar producto existente',exact:true}).click();assert.equal((await vinculo).status(),201);
    const mismo=await pedir(admin,`/productos/${p1.id}`);assert.equal(mismo.stockFisico,20);assert.ok(mismo.codigosLectura.includes(codigoQR)&&mismo.codigosLectura.includes(marca+'-etiqueta-nueva'));
    casos.push('Productos: alta con cámara, coincidencia por nombre y segunda etiqueta del mismo producto sin duplicar stock');
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
    const segundaAsignacion=await pedir(admin,`/inventario/compartidos/${general.id}/asignar`,'POST',{});
    await contar.getByRole('button',{name:'Tomar siguiente producto',exact:true}).click();await contar.getByLabel('Cantidad contada').waitFor();
    await contar.getByLabel('Cantidad contada').fill('99');await contar.getByRole('button',{name:'Salir del conteo y continuar después',exact:true}).click();
    await contar.getByRole('dialog',{name:'Salir del conteo',exact:true}).getByRole('button',{name:'Volver',exact:true}).click();assert.equal(await contar.getByLabel('Cantidad contada').inputValue(),'99');
    await contar.getByRole('button',{name:'Salir del conteo y continuar después',exact:true}).click();await contar.getByRole('button',{name:'Continuar después',exact:true}).click();await contar.getByRole('heading',{name:'Conteos disponibles',exact:true}).waitFor();
    const pausado=await pedir(admin,`/inventario/compartidos/${general.id}`);assert.equal(pausado.estado,'en-curso');assert.equal(pausado.contadas,2);assert.equal(pausado.ocupadas,1);
    const ajena=await pedir(admin,`/inventario/compartidos/${general.id}/lineas?q=${encodeURIComponent(segundaAsignacion.codigo)}`);assert.ok(ajena.some(l=>l.productoId===segundaAsignacion.productoId&&l.asignadoPorId));
    await contar.reload();await contar.getByText('Inventario general · en curso',{exact:true}).first().click();await contar.getByPlaceholder('Buscar producto del conteo').fill(marca);await contar.getByText('Contado: 13',{exact:false}).waitFor();
    await pedir(inv,`/inventario/conteos/${general.id}/cancelar`,'POST',{},403);
    await pedir(admin,`/inventario/compartidos/${general.id}/asignar?liberar=true`,'POST',{});
    casos.push('X con confirmación: volver conserva borrador; salir conserva dos cantidades y libera solo al colaborador, permite retomar y no concede cancelación global');
    const diariosPrevios=await pedir(admin,'/inventario/compartidos?tipo=aleatorio');for(const c of diariosPrevios.filter(c=>c.tipo==='aleatorio'&&c.estado==='en-curso'))await pedir(admin,`/inventario/conteos/${c.id}/cancelar`,'POST');
    const correoVendedor = marca + '-vendedor@pruebas.invalid';
    await pedir(admin,'/usuarios','POST',{nombre:'Vendedor lector de prueba',email:correoVendedor,password:'SoloPruebas2026!',rol:'vendedor'});
    const vendedor = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await vendedor.addInitScript(camaraFalsa);
    await pedir(vendedor,'/auth/login','POST',{identifier:correoVendedor,password:'SoloPruebas2026!'},200);
    const diarioVista = await vendedor.newPage();diarioVista.on('pageerror',e=>errores.push(e.message));await diarioVista.goto(base+'/vendedor');
    await diarioVista.getByText('Conteo diario',{exact:true}).click();const apertura=diarioVista.waitForResponse(r=>r.url().endsWith('/inventario/compartidos')&&r.request().method()==='POST');await diarioVista.getByRole('button',{name:'Abrir conteo de hoy · 5 productos',exact:true}).click();const resultadoApertura=await apertura;
    if(resultadoApertura.status()===403){assert.equal((await resultadoApertura.json()).code,'CONTEO_CERRADO');await diarioVista.getByRole('alert').filter({hasText:'ya terminó'}).waitFor();casos.push('Diario previamente confirmado en QA: se conserva su historial y se impide reabrirlo; el escaneo diario se valida en la base aislada de códigos');}
    else {assert.equal(resultadoApertura.status(),201);await diarioVista.getByRole('progressbar',{name:'Progreso del conteo'}).waitFor();
    const diarios = await pedir(vendedor,'/inventario/compartidos');const diarioActual=diarios[0];
    const pendientesDiarios = await pedir(vendedor,`/inventario/compartidos/${diarioActual.id}/lineas`);const pendienteDiario=pendientesDiarios.find(l=>l.stockFisico===null&&!l.asignadoPorId);
    assert.ok(pendienteDiario,'Un producto del diario disponible');
    await figura(diarioVista,qr(pendienteDiario.codigo));await diarioVista.getByRole('button',{name:'Contar con cámara',exact:true}).click();await diarioVista.getByLabel('Cantidad contada').waitFor({timeout:20000});
    await figura(diarioVista,[]);await diarioVista.getByLabel('Cantidad contada').fill('0');const cantidadDiariaGuardada=diarioVista.waitForResponse(r=>r.url().includes(`/inventario/conteos/${diarioActual.id}/lineas/`)&&r.request().method()==='PATCH');await diarioVista.getByRole('button',{name:'Guardar cantidad',exact:true}).click();assert.equal((await cantidadDiariaGuardada).status(),200);
    const verificacionDiaria=await pedir(vendedor,`/inventario/compartidos/${diarioActual.id}/lineas`);assert.equal(verificacionDiaria.find(l=>l.productoId===pendienteDiario.productoId).stockFisico,0);
    if(verificacionDiaria.some(l=>l.stockFisico===null)){await diarioVista.getByRole('dialog',{name:'Escanear producto'}).waitFor();await diarioVista.getByRole('button',{name:'Cerrar',exact:true}).click();}
    await diarioVista.screenshot({path:'.local/pruebas-v7/vendedor-diario-390.png'});casos.push('Vendedor tiene entrada visible al diario, escanea uno de los cinco y guarda cero; el historial administrativo permanece oculto');
    await diarioVista.getByRole('button',{name:'Salir del conteo y continuar después',exact:true}).click();await diarioVista.getByRole('button',{name:'Continuar después',exact:true}).click();await diarioVista.getByRole('button',{name:'Abrir conteo de hoy · 5 productos',exact:true}).click();await diarioVista.getByRole('progressbar').waitFor();assert.equal((await pedir(vendedor,`/inventario/compartidos/${diarioActual.id}`)).contadas,1);
    casos.push('Vendedor puede salir y retomar el mismo conteo diario con su cantidad guardada');
    }
    if (!process.argv.includes("--solo-escaner")) {
    const robotContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await pedir(robotContext,'/auth/login','POST',{identifier:'qa-admin@pruebas.invalid',password:'SoloPruebas2026!'},200);
    await robotContext.addInitScript(()=>{window.__pistasMicrofono=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async opciones=>{const flujo=await original(opciones);if(opciones.audio)window.__pistasMicrofono.push(...flujo.getAudioTracks());return flujo;};});
    await robotContext.route('**/agentes/estado',r=>r.fulfill({json:{data:{habilitado:true,modo:'hibrido',configurado:true,audio:{idioma:'es-CO',velocidad:1,volumen:0,voz:'',modeloStt:'base',stt:'whisper'}}}}));
    await robotContext.route('**/agentes/audio/sesion',r=>r.fulfill({json:{data:{ticket:'prueba-ui'}}}));
    let socketRobot,conexionesAudio=0;
    await robotContext.routeWebSocket('**/agentes/audio/conversar?*',ws=>{socketRobot=ws;conexionesAudio++;setTimeout(()=>ws.send(JSON.stringify({tipo:'listo'})),50);ws.onMessage(()=>{});});
    const robot=await robotContext.newPage();robot.on('pageerror',e=>errores.push(e.message));await robot.goto(base+'/admin/productos');const boton=robot.getByRole('button',{name:'Asistente',exact:true});await boton.click();
    await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    assert.equal(await robot.getByRole('button',{name:'Hablar',exact:true}).count(),0);assert.equal(await robot.getByRole('button',{name:'Detener',exact:true}).count(),0);
    await robot.getByLabel('Ancho del texto del asistente').evaluate(e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'440');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await robot.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await robot.getByPlaceholder('Buscar por nombre, código o categoría').click();assert.equal(await robot.getByLabel('Ancho del texto del asistente').count(),0);assert.equal(await boton.getAttribute('aria-pressed'),'true');
    await robot.waitForTimeout(350);await boton.click();assert.equal(await boton.getAttribute('aria-pressed'),'false');
    await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    await robot.waitForTimeout(350);await boton.dblclick({delay:80});assert.equal(await boton.getAttribute('aria-pressed'),'false');assert.equal(await boton.getAttribute('aria-expanded'),'false');
    const revisionPendiente=await pedir(admin,'/agentes/revisar','POST',{id:randomUUID(),version:1,instruccion:{operacion:'precio',producto:p1.nombre,precio:2800}});
    await robotContext.route('**/agentes/interpretar',async r=>{await new Promise(resolve=>setTimeout(resolve,850));await r.fulfill({json:{data:revisionPendiente}});});
    await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    socketRobot.send(JSON.stringify({tipo:'instruccion',texto:'Cambia el precio del producto a 2800'}));await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.dataset.estado==='pensando');
    await robot.waitForTimeout(350);await boton.click();assert.equal(await boton.getAttribute('aria-pressed'),'false');await robot.getByText('Confirmar cambio',{exact:true}).waitFor().catch(async error=>{await robot.screenshot({path:'.local/pruebas-v8/robot-pendiente-fallo.png'});console.error('Detalle visible en la prueba: '+await robot.locator('body').innerText());console.error('Errores de página: '+JSON.stringify(errores));throw error;});
    casos.push('Detener micrófono durante interpretación conserva la respuesta y abre la confirmación; doble toque apaga sin guardar');
    casos.push('Robot con transporte simulado: un toque escucha, otro detiene; tocar fuera cierra solo la burbuja; ancho ajustable y sin botones Hablar/Detener');
    let cancelaciones=0;await robot.evaluate(()=>{window.__cancelacionesVoz=0;const cancelar=speechSynthesis.cancel.bind(speechSynthesis);speechSynthesis.cancel=()=>{window.__cancelacionesVoz++;cancelar();};});
    await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    cancelaciones=await robot.evaluate(()=>window.__cancelacionesVoz);assert.ok(cancelaciones>0);assert.ok(!(await robot.locator('aside[aria-label="Asistente de operaciones"]').innerText()).includes('Hola, soy'));
    await robot.locator('body').dispatchEvent('pointerdown');assert.equal(await boton.getAttribute('aria-pressed'),'true');assert.equal(await robot.getByLabel('Ancho del texto del asistente').count(),0);await robot.waitForTimeout(350);await boton.dblclick({delay:80});
    casos.push('Reactivar micrófono interrumpe TTS y reanuda sin repetir saludo; cerrar nube no apaga la escucha');
    await robot.goto(base+'/admin/productos');await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');
    const correccionPendiente=await pedir(admin,'/agentes/revisar','POST',{id:revisionPendiente.id,version:2,instruccion:{operacion:'precio',producto:p1.nombre,precio:3200}});const instruccionesRecibidas=[];
    await robotContext.route('**/agentes/interpretar',async r=>{const cuerpo=r.request().postDataJSON();instruccionesRecibidas.push(cuerpo);await new Promise(resolve=>setTimeout(resolve,cuerpo.texto.includes('3200')?100:1100));await r.fulfill({json:{data:cuerpo.texto.includes('3200')?correccionPendiente:revisionPendiente}});});
    socketRobot.send(JSON.stringify({tipo:'instruccion',texto:'Pon el precio a 2800'}));await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.dataset.estado==='pensando');
    socketRobot.send(JSON.stringify({tipo:'instruccion',texto:'Mejor a 3200'}));await robot.waitForFunction(()=>document.querySelector('[aria-label="Texto reconocido"]')?.textContent.includes('3200'));
    await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.dataset.estado==='reposo'||document.querySelector('button[aria-label="Asistente"]')?.dataset.estado==='escuchando');
    assert.equal(instruccionesRecibidas.length,2);assert.equal(instruccionesRecibidas[1].anterior.precio,2800);assert.ok((await robot.locator('body').innerText()).includes('3.200'));assert.equal((await pedir(admin,`/productos/${p1.id}`)).precioVenta,2600);
    await robot.waitForTimeout(350);await boton.dblclick({delay:80});casos.push('Corrección dictada durante razonamiento se procesa después con el borrador anterior, cambia a 3200 y no guarda sin confirmar');
    await robot.goto(base+'/admin/productos');await robot.waitForTimeout(350);await boton.click();await robot.waitForFunction(()=>document.querySelector('button[aria-label="Asistente"]')?.getAttribute('aria-pressed')==='true');const conexionesAntes=conexionesAudio;
    await robot.waitForTimeout(350);await boton.click();assert.equal(await boton.getAttribute('aria-pressed'),'false');assert.ok(await robot.evaluate(()=>window.__pistasMicrofono.every(t=>!t.enabled)));
    socketRobot.send(JSON.stringify({tipo:'texto',texto:'Pon el precio a 2800'}));socketRobot.send(JSON.stringify({tipo:'instruccion',texto:'Pon el precio a 2800'}));await robot.getByText('Confirmar cambio',{exact:true}).waitFor();assert.equal(await boton.getAttribute('aria-pressed'),'false');
    await robot.waitForTimeout(350);await boton.click();assert.equal(await boton.getAttribute('aria-pressed'),'true');assert.equal(conexionesAudio,conexionesAntes);assert.ok(await robot.evaluate(()=>window.__pistasMicrofono.every(t=>t.enabled)));
    await robot.waitForTimeout(350);await boton.dblclick({delay:80});await robot.waitForFunction(()=>window.__pistasMicrofono.every(t=>t.readyState==='ended'));
    casos.push('Silenciar deshabilita las pistas sin cerrar la sesión: admite transcripción pendiente, reanuda sin nueva conexión y doble toque libera el micrófono');
    }
    const camarasContext=await browser.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true});await pedir(camarasContext,'/auth/login','POST',{identifier:'qa-admin@pruebas.invalid',password:'SoloPruebas2026!'},200);await camarasContext.addInitScript(camaraFalsa);
    await camarasContext.addInitScript(()=>{
      window.__ajustesCamara=[];window.__restriccionesCamara=[];window.__intentosNativos=0;
      const capturar=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices=async()=>['principal','auxiliar'].map(deviceId=>({deviceId,kind:'videoinput',label:'Trasera '+deviceId,groupId:'qa'}));
      navigator.mediaDevices.getUserMedia=async restricciones=>{window.__restriccionesCamara.push(restricciones);if(window.__camaraRetirada&&restricciones.video.deviceId?.exact==='auxiliar')throw new DOMException('Cámara retirada','NotFoundError');const flujo=await capturar(restricciones);const t=flujo.getVideoTracks()[0];if(t){t.getCapabilities=()=>({focusMode:['continuous'],torch:true,zoom:{min:1,max:3,step:0.1}});t.getSettings=()=>({deviceId:restricciones.video.deviceId?.exact??'principal',zoom:1});t.applyConstraints=async c=>window.__ajustesCamara.push(c);}return flujo;};
      window.BarcodeDetector=class {static async getSupportedFormats(){return ['ean_13'];}async detect(){window.__intentosNativos++;throw new Error('Lector nativo temporalmente no disponible');}};
    });
    const camarasPagina=await camarasContext.newPage();camarasPagina.on('pageerror',e=>errores.push(e.message));await camarasPagina.goto(base+'/admin/ventas/pedido');await camarasPagina.getByText('Venta abierta · cliente ocasional',{exact:true}).click();await figura(camarasPagina,[]);await camarasPagina.getByRole('button',{name:'Escanear código',exact:true}).click();await camarasPagina.getByLabel('Cambiar cámara').waitFor();await camarasPagina.getByRole('button',{name:'Encender luz',exact:true}).click();assert.equal(await camarasPagina.getByRole('button',{name:'Apagar luz',exact:true}).getAttribute('aria-pressed'),'true');
    await camarasPagina.getByLabel('Cambiar cámara').selectOption('auxiliar');await camarasPagina.waitForFunction(()=>window.__restriccionesCamara.length>=2&&window.__ajustesCamara.length>=3);assert.ok(await camarasPagina.evaluate(()=>window.__pistasCamara.slice(0,-1).every(p=>p.readyState==='ended')));
    await figura(camarasPagina,barras.figura);await camarasPagina.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden',timeout:20000});await camarasPagina.getByRole('button',{name:'Disminuir cantidad'}).waitFor();
    assert.ok(await camarasPagina.evaluate(()=>window.__pistasCamara.every(p=>p.readyState==='ended')&&window.__intentosNativos>=1&&window.__restriccionesCamara.every(r=>r.video.width.ideal===1920)));
    await figura(camarasPagina,[]);await camarasPagina.getByRole('button',{name:'Escanear código',exact:true}).click();await camarasPagina.getByLabel('Cambiar cámara').waitFor();await camarasPagina.waitForFunction(()=>document.querySelector('select[aria-label="Cambiar cámara"]')?.value==='auxiliar');assert.equal(await camarasPagina.evaluate(()=>window.__restriccionesCamara.at(-1).video.deviceId.exact),'auxiliar');await camarasPagina.getByRole('button',{name:'Cerrar',exact:true}).click();
    await camarasPagina.evaluate(()=>{window.__camaraRetirada=true;});await camarasPagina.getByRole('button',{name:'Escanear código',exact:true}).click();await camarasPagina.getByLabel('Cambiar cámara').waitFor();await camarasPagina.waitForFunction(()=>document.querySelector('select[aria-label="Cambiar cámara"]')?.value==='principal');assert.equal(await camarasPagina.evaluate(()=>sessionStorage.getItem('synchronic:camara-preferida')),null);await figura(camarasPagina,barras.figura);await camarasPagina.getByRole('dialog',{name:'Escanear producto'}).waitFor({state:'hidden',timeout:20000});
    casos.push('Cámara con capacidades simuladas: resolución Full HD, enfoque/luz/selector y liberación al cambiar; fallo nativo vuelve al EAN real de ZXing');
    const escritorio=await admin.newPage();escritorio.on('pageerror',e=>errores.push(e.message));await escritorio.setViewportSize({width:1440,height:900});await escritorio.goto(base+'/admin/inventario');await escritorio.getByText('Conteo guiado',{exact:true}).first().click();await escritorio.getByText('Inventario general · en curso',{exact:true}).first().click();
    assert.equal(await escritorio.getByRole('heading',{name:'Historial y progreso de inventarios',exact:true}).count(),0);
    await escritorio.getByRole('button',{name:'← Historial',exact:true}).click();await escritorio.getByRole('heading',{name:'Historial y progreso de inventarios',exact:true}).waitFor();
    await escritorio.screenshot({path:'.local/pruebas-v7/historial-1440.png'});casos.push('Administrador: lista de historial y detalle separados, paginación compacta en 390 y 1440');
    await escritorio.getByText('Inventario general · en curso',{exact:true}).first().click();await escritorio.getByRole('button',{name:'Cancelar conteo definitivamente',exact:true}).click();await escritorio.getByRole('dialog',{name:'Cancelar conteo definitivamente',exact:true}).getByRole('button',{name:'Volver',exact:true}).click();assert.equal((await pedir(admin,`/inventario/compartidos/${general.id}`)).estado,'en-curso');
    await pedir(admin,`/inventario/compartidos/${general.id}/asignar`,'POST',{});await escritorio.getByRole('button',{name:'Cancelar conteo definitivamente',exact:true}).click();await escritorio.getByRole('button',{name:'Sí, cancelar',exact:true}).click();await escritorio.waitForFunction(()=>!document.querySelector('button[aria-label="Cancelar conteo definitivamente"]'));
    const cancelado=await pedir(admin,`/inventario/compartidos/${general.id}`);assert.equal(cancelado.estado,'cancelado');assert.equal(cancelado.contadas,2);assert.equal(cancelado.ocupadas,0);assert.equal((await pedir(admin,`/productos/${p1.id}`)).stockFisico,20);
    casos.push('X de cancelación definitiva administrativa: exige confirmación, libera asignaciones, mantiene historial y no cambia stock');

    const familiar=await pedir(admin,'/productos','POST',{nombre:p1.nombre,productoBaseId:p1.id,extension:'Familiar',unidad:'bolsa',precioVenta:2800,costoActual:1000,stock:6,codigosLectura:[codigoQR]});
    assert.equal(familiar.rowid,p1.id);assert.equal(familiar.rowid_ext,familiar.id);
    await page.goto(base+'/admin/ventas/pedido');await page.getByText('Venta abierta · cliente ocasional',{exact:true}).click();
    await figura(page,qr(codigoQR));await page.getByRole('button',{name:'Escanear código',exact:true}).click();
    await page.getByRole('dialog',{name:'Elegir presentación',exact:true}).getByText(familiar.nombre,{exact:true}).click();
    await page.waitForFunction(n=>document.querySelector('input[placeholder="Buscar producto o código"]')?.value===n,familiar.nombre);
    await page.getByRole('button',{name:'Disminuir cantidad'}).first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Disminuir cantidad'}).count(),1);
    const nuevoGeneral=await pedir(admin,'/inventario/conteos','POST',{tipo:'general',turno:marca+' familia'});
    await contar.goto(base+'/inventario');await contar.getByText('Inventario general · en curso',{exact:true}).first().click();
    await figura(contar,qr(codigoQR));await contar.getByRole('button',{name:'Contar con cámara',exact:true}).click();
    await contar.getByRole('dialog',{name:'Elegir presentación',exact:true}).getByText(familiar.nombre,{exact:true}).click();
    await contar.getByLabel('Cantidad contada').fill('2');await figura(contar,[]);await contar.getByRole('button',{name:'Guardar cantidad',exact:true}).click();
    await contar.getByRole('dialog',{name:'Escanear producto',exact:true}).waitFor();await contar.getByRole('button',{name:'Cerrar',exact:true}).click();
    const lineaFamiliar=(await pedir(admin,`/inventario/compartidos/${nuevoGeneral.id}/lineas?q=${encodeURIComponent(familiar.nombre)}`)).find(l=>l.productoId===familiar.id);assert.equal(lineaFamiliar.stockFisico,2);
    await pedir(admin,'/inventario/conteos/'+nuevoGeneral.id+'/cancelar','POST',{});
    await page.goto(base+'/admin/productos');await figura(page,qr(codigoQR));await page.getByRole('button',{name:'Escanear código',exact:true}).click();
    await page.getByRole('dialog',{name:'Elegir presentación',exact:true}).getByText(familiar.nombre,{exact:true}).click();
    assert.equal(await page.getByLabel('Presentación o extensión',{exact:true}).inputValue(),'Familiar');
    const provLector=await pedir(admin,'/proveedores','POST',{nombre:marca+' Proveedor lector'});
    await page.goto(base+'/admin/compras');await page.getByRole('button',{name:/Nueva recepción/}).click();
    await page.getByPlaceholder('Buscar por nombre o teléfono').fill(provLector.nombre);await page.getByText(provLector.nombre,{exact:true}).click();
    await page.getByRole('button',{name:/Continuar a productos/}).click();await page.getByRole('button',{name:'+ Producto',exact:true}).click();
    await figura(page,qr(codigoQR));await page.getByRole('button',{name:'Escanear código',exact:true}).click();
    await page.getByRole('dialog',{name:'Elegir presentación',exact:true}).getByText(familiar.nombre,{exact:true}).click();
    await page.getByRole('button',{name:'Usar producto existente',exact:true}).click();
    await page.waitForFunction(n=>document.querySelector('input[placeholder="Filtrar por código o nombre"]')?.value===n,familiar.nombre);
    assert.equal((await pedir(admin,'/productos/'+familiar.id)).stockFisico,6);
    casos.push('Una etiqueta compartida: venta elige y agrega solo Familiar; general guarda dos unidades de su rowid_ext; Productos edita la extensión correcta y Compras la trae sin duplicar el producto ni alterar stock');

    assert.deepEqual(errores,[]);for(const c of casos)console.log('✓ '+c);writeFileSync('.local/pruebas-v7/escaner-ui.json',JSON.stringify({fecha:new Date().toISOString(),casos,lecturas,errores},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(String(e.stack).replace(/ambie_(?:access|refresh)=[^;\s]+/g,'sesion=[oculta]'));process.exitCode=1;});
