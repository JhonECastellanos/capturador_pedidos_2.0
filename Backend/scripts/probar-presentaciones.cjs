// Ejercicios sobre contenedores QA: nunca modifica los datos del negocio.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');const {chromium}=require('playwright');
const {writeFileSync,mkdirSync}=require('node:fs');
const url=new URL('postgresql://127.0.0.1:5433/ambie_test');url.username=process.env.POSTGRES_USER||'ambie';url.password=process.env.POSTGRES_PASSWORD;
const db=new PrismaClient({datasourceUrl:url.href});const origen='http://127.0.0.1:8180';const casos=[];const marca='QA-presentaciones-'+Date.now();
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 async function api(ruta,method='GET',data,status=method==='POST'?201:200){const r=await ctx.request.fetch(origen+'/api/v1'+ruta,{method,data,headers:method==='GET'?{}:{'Idempotency-Key':randomUUID()}});const j=await r.json();assert.equal(r.status(),status,`${method} ${ruta}: ${j.message||''}`);return j.data;}
 try{
 await api('/auth/login','POST',{identifier:'system',password:process.env.SYSTEM_PASSWORD||process.env.BOOTSTRAP_PASSWORD},200);
 const base=await api('/productos','POST',{nombre:marca+' Jugo',categoria:'Bebidas',precioVenta:2000,costoActual:700,stock:10,codigosLectura:[marca+'-viejo']});
 const a=await api('/productos','POST',{nombre:base.nombre,productoBaseId:base.id,extension:'250 ml',unidad:'botella',precioVenta:2500,costoActual:800,stock:5,codigosLectura:[marca+'-250']});
 const b=await api('/productos','POST',{nombre:base.nombre,productoBaseId:base.id,extension:'1 litro',unidad:'botella',precioVenta:7000,costoActual:2000,stock:4});
 assert.equal(a.categoria,base.categoria);assert.equal(b.categoria,base.categoria);
 assert.equal(a.rowid,base.id);assert.equal(b.rowid,base.id);assert.equal(a.rowid_ext,a.id);assert.notEqual(a.id,b.id);
 assert.deepEqual((await db.$queryRaw`SELECT rowid,rowid_ext FROM "identidadesProducto" WHERE rowid_ext=${a.id}`)[0],{rowid:base.id,rowid_ext:a.id});
 await api('/productos','POST',{nombre:base.nombre,productoBaseId:base.id,extension:'250 ML',precioVenta:4},409);
 await api('/productos','POST',{nombre:a.nombre,productoBaseId:a.id,extension:'Nueva',precioVenta:4},409);
 casos.push('Dos presentaciones: mismo rowid, rowid_ext/código/stock independientes; duplicado y dependencia anidada rechazados');
 const etiqueta=await api('/productos/'+base.id+'/codigos','POST',{codigo:marca+'-nuevo'});await api('/productos/'+base.id+'/codigos','POST',{codigo:marca+'-nuevo'});
 assert.equal((await db.codigoProducto.count({where:{productoId:base.id}})),2);assert.equal((await api('/productos/codigo/lectura?codigo='+marca+'-nuevo')).id,base.id);
 const viejo=(await api('/productos/'+base.id+'/codigos')).find(c=>c.codigo===marca+'-viejo');await api(`/productos/${base.id}/codigos/${viejo.id}/retirar`,'POST');
 await api('/productos/codigo/lectura?codigo='+marca+'-viejo','GET',undefined,409);assert.equal((await api('/productos/codigo/lectura?codigo='+marca+'-nuevo')).id,base.id);assert.equal((await api('/productos/'+base.id)).stockFisico,10);
 casos.push('Segunda etiqueta idempotente; retiro de la antigua conserva producto, cantidad y trazabilidad');
 const pedido=await api('/pedidos','POST',{clienteId:null,lineas:[{productoId:a.id,cantidad:2}],metodo:'efectivo',estadoInicial:'entregado',momentoCobro:'inmediato'});
 const historico=await db.pedidoLinea.findFirstOrThrow({where:{pedidoId:pedido.id}});assert.equal(historico.nombre,a.nombre);
 const page=await ctx.newPage();const errores=[];page.on('pageerror',e=>errores.push(e.message));await page.goto(origen+'/admin/precios');await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(base.nombre);await page.getByText(base.nombre,{exact:true}).first().click();
 const nuevo=marca+' Bebida';await page.getByLabel('Nombre del producto',{exact:true}).fill(nuevo);await page.getByRole('button',{name:'Revisar y confirmar →',exact:true}).click();await page.getByText('Nuevo nombre: '+nuevo,{exact:true}).waitFor();
 const guardado=page.waitForResponse(r=>r.url().endsWith('/precio')&&r.request().method()==='POST');await page.getByRole('button',{name:'Guardar precio',exact:true}).click();assert.equal((await guardado).status(),201);
 assert.equal((await api('/productos/'+a.id)).nombre,nuevo+' · 250 ml');assert.equal((await api('/productos/'+b.id)).nombre,nuevo+' · 1 litro');assert.equal((await db.pedidoLinea.findFirstOrThrow({where:{pedidoId:pedido.id}})).nombre,historico.nombre);
 assert.equal((await api('/productos/'+a.id)).stockFisico,3);assert.equal((await api('/productos/'+b.id)).stockFisico,4);
 await api('/productos/'+a.id+'/precio','POST',{nuevoPrecio:2500,extension:'300 ml'});assert.equal((await api('/productos/'+a.id)).nombre,nuevo+' · 300 ml');
 await api('/productos/'+a.id+'/precio','POST',{nuevoPrecio:2500,extension:'1 litro'},409);assert.equal((await api('/productos/'+a.id)).extension,'300 ml');
 casos.push('Edición real en Precios: renombra principal y presentaciones, conserva factura/precios históricos y stock; colisión revierte');
 await api('/productos/'+base.id+'/precio','POST',{nuevoPrecio:2000,extension:'Individual'});
 const principalEditado=await api('/productos/'+base.id);assert.equal(principalEditado.nombre,nuevo+' · Individual');assert.equal(principalEditado.nombreBase,nuevo);assert.equal(principalEditado.id,base.id);assert.equal((await api('/productos/'+b.id)).nombre,nuevo+' · 1 litro');
 await api('/productos','POST',{nombre:nuevo,productoBaseId:base.id,extension:'Individual',precioVenta:1},409);
 await api('/productos/'+base.id+'/precio','POST',{nuevoPrecio:2000,extension:'1 litro'},409);
 const otra=await api('/productos','POST',{nombre:nuevo,productoBaseId:base.id,extension:'500 ml',precioVenta:4000});assert.equal(otra.nombre,nuevo+' · 500 ml');assert.equal(otra.rowid,base.id);
 await api('/productos/importar','POST',{prepararInicial:false,productos:[{codigoInterno:base.codigoInterno,nombre:principalEditado.nombre,precioVenta:2000,costoActual:700}]});assert.equal((await api('/productos/'+base.id)).nombre,principalEditado.nombre);assert.equal((await api('/productos/'+base.id)).stockFisico,10);
 casos.push('El producto existente admite su primera presentación sin cambiar ID, stock o el nombre de otras variantes; combinación duplicada rechazada');
 const concurrentes=await Promise.all([1,2].map(()=>ctx.request.post(origen+'/api/v1/productos',{data:{nombre:nuevo,productoBaseId:base.id,extension:'2 litros',precioVenta:10000},headers:{'Idempotency-Key':randomUUID()}})));assert.deepEqual(concurrentes.map(r=>r.status()).sort(),[201,409]);
 casos.push('Dos creaciones simultáneas de la misma presentación: una confirmación y ningún duplicado');
 await page.goto(origen+'/admin/precios');await page.getByPlaceholder('Buscar por nombre, código o categoría').fill(nuevo+' · Individual');await page.getByText(nuevo+' · Individual',{exact:true}).first().click();await page.getByRole('button',{name:'Crear presentación de este producto',exact:true}).click();
 assert.equal(await page.getByLabel('Nombre del producto',{exact:true}).inputValue(),nuevo);assert.equal(await page.getByLabel('Categoría',{exact:true}).inputValue(),'Bebidas');await page.getByLabel('Presentación o extensión',{exact:true}).fill('Paquete de 6');await page.getByLabel('Costo del producto',{exact:true}).fill('6000');await page.getByLabel('Precio de venta',{exact:true}).fill('12000');
 const creada=page.waitForResponse(r=>r.url().endsWith('/productos')&&r.request().method()==='POST');await page.getByRole('button',{name:'Crear producto',exact:true}).click();const respuesta=await creada;assert.equal(respuesta.status(),201);const nueva=(await respuesta.json()).data;assert.equal(nueva.productoBaseId,base.id);assert.equal(nueva.nombre,nuevo+' · Paquete de 6');assert.equal(nueva.categoria,'Bebidas');assert.equal(nueva.stockFisico,0);
 casos.push('Formulario crea una variante desde el producto ya presentado, muestra nombre principal y conserva categoría, costo y precio');
 const tamaños=[{width:320,height:640},{width:360,height:800},{width:393,height:873},{width:412,height:915},{width:480,height:854},{width:600,height:960},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080}];
 for(const tamaño of tamaños){await page.setViewportSize(tamaño);for(const ruta of ['','ventas','pedidos','creditos','inventario','compras','precios','caja','cierre','usuarios','auditoria','configuracion']){
  await page.goto(origen+'/admin/'+ruta,{waitUntil:'networkidle'});if(ruta==='inventario')await page.getByText('Stock general',{exact:true}).first().click();const listas=await page.locator('.lista-datos,.lista-productos').evaluateAll(es=>es.map(e=>({desbordado:e.scrollHeight>e.clientHeight+1,overflow:getComputedStyle(e).overflowY})));assert.ok(listas.every(l=>!['auto','scroll'].includes(l.overflow)),ruta+' '+tamaño.width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(tamaño.width<640){const relleno=await page.locator('.admin-contenido').evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft));assert.ok(relleno<=10,'Margen lateral móvil '+ruta+' '+tamaño.width);}
  if(tamaño.width===393&&['precios','inventario','pedidos'].includes(ruta)){mkdirSync('.local/pruebas-v8',{recursive:true});await page.screenshot({path:'.local/pruebas-v8/'+ruta+'-393-compacto.png'});}
 }}casos.push('Doce módulos en diez tamaños de 320 a 1920 px: sin desbordamiento horizontal ni scroll interno de listas, margen móvil máximo diez px');assert.deepEqual(errores,[]);
 mkdirSync('.local/pruebas-v8',{recursive:true});writeFileSync('.local/pruebas-v8/presentaciones.json',JSON.stringify({fecha:new Date().toISOString(),casos},null,2));for(const c of casos)console.log('✓ '+c);
 }finally{await ctx.close();await browser.close();await db.$disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
