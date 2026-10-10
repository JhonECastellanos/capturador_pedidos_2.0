const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { seleccionarConteoDiario } = require('@ambie/contrato');
const base = 'http://localhost:8180';
const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
const usuarioBd = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
const sql = consulta => execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuarioBd, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: consulta }).trim();

async function main() {
  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
  const resultados = { fecha: new Date().toISOString(), base, conteos: [], conjuntos: [], resoluciones: [], interacciones: [], errores: [] };
  mkdirSync('.local/pruebas-criterios', { recursive: true });
  async function api(ruta, metodo = 'GET', datos, status = metodo === 'POST' ? 201 : 200) {
    const r = await contexto.request.fetch(base + '/api/v1' + ruta, { method: metodo, data: datos });
    const cuerpo = await r.json(); assert.equal(r.status(), status, `${metodo} ${ruta}: ${JSON.stringify(cuerpo)}`);
    return cuerpo;
  }
  try {
    for (const cantidad of [0,1,5,6,15,16,100,1000]) {
      const productos=Array.from({length:cantidad},(_,i)=>({id:String(i)}));
      const vistos=new Set(), ciclos=new Map(); let ciclo=1;
      for(let dia=0;dia<Math.ceil(cantidad/5);dia++) {
        const seleccion=seleccionarConteoDiario(productos,ciclo,ciclos.get(ciclo) ?? new Set(),()=>0.37);
        assert.equal(new Set(seleccion.map(l=>l.producto.id)).size,Math.min(5,cantidad));
        for(const l of seleccion) {
          const cubiertos=ciclos.get(l.ciclo) ?? new Set();
          assert.ok(!cubiertos.has(l.producto.id)); cubiertos.add(l.producto.id); ciclos.set(l.ciclo,cubiertos);
          vistos.add(l.producto.id); ciclo=Math.max(ciclo,l.ciclo);
        }
      }
      assert.equal(vistos.size,cantidad);
    }
    console.log('✓ Selección compartida: ocho tamaños, cobertura completa y sin repetición por ciclo');
    await api('/auth/login', 'POST', { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD }, 200);
    const activos = JSON.parse(sql('SELECT COALESCE(json_agg(id ORDER BY id),\'[]\') FROM productos WHERE activo;'));
    writeFileSync('.local/pruebas-criterios/catalogo-activo-previo.json',JSON.stringify(activos));
    try {
      for (const cantidad of [0, 1, 5, 6]) {
        sql('UPDATE productos SET activo=false WHERE activo;');
        if (cantidad) sql(`UPDATE productos SET activo=true WHERE id IN (${activos.slice(0, cantidad).map(id => `'${id}'`).join(',')});`);
        const r = await api('/inventario/conteos', 'POST', { tipo: 'aleatorio', turno: 'Catálogo pequeño QA' }, cantidad ? 201 : 400);
        if (cantidad) {
          assert.equal(r.data.lineas.length, Math.min(cantidad, 5));
          assert.equal(new Set(r.data.lineas.map(l => l.productoId)).size, r.data.lineas.length);
          await api(`/inventario/conteos/${r.data.id}/cancelar`, 'POST');
          await api(`/inventario/conteos/${r.data.id}/aplicar-ajuste`, 'POST', undefined, 400);
        }
        resultados.conteos.push({ activos: cantidad, seleccion: Math.min(cantidad, 5), correcto: true });
      }
    } finally { sql(`UPDATE productos SET activo=true WHERE id IN (${activos.map(id => `'${id}'`).join(',')});`); }
    console.log('✓ Catálogos de 0, 1, 5 y 6: selección, cancelación y rechazo de aplicación');

    const marca = 'QA-Paginacion-20261010';
    const existentes = [];
    for (let pagina = 1; ; pagina++) {
      const r = await api(`/productos?q=${marca}&page=${pagina}&pageSize=200`); existentes.push(...r.data);
      if (existentes.length >= r.meta.total) break;
    }
    const nombres = new Set(existentes.map(p => p.nombre));
    const cantidades = [0, 1, 5, 6, 15, 16, 100, 1000];
    for (let inicio = 0; inicio < 1000; inicio += 8) {
      await Promise.all(Array.from({ length: Math.min(8, 1000 - inicio) }, (_, delta) => {
        const indice = inicio + delta;
        const nombre = `${marca} ${cantidades.filter(n => indice < n).map(n => `[n=${n}]`).join(' ')} ${String(indice).padStart(4, '0')}`;
        return nombres.has(nombre) ? undefined : api('/productos', 'POST', { nombre, precioVenta: 1000, costoActual: 400, stock: 10 });
      }));
      if ((inicio + 8) % 200 === 0) console.log(`Catálogo de pruebas preparado: ${inicio + 8}/1000`);
    }
    for (const cantidad of cantidades) for (const tamaño of [5, 15]) {
      const vistos = new Set(), paginas = Math.max(1, Math.ceil(cantidad / tamaño));
      for (let pagina = 1; pagina <= paginas; pagina++) {
        const r = await api(`/productos?q=${encodeURIComponent(`[n=${cantidad}]`)}&orden=nombre&page=${pagina}&pageSize=${tamaño}`);
        assert.equal(r.meta.total, cantidad,`Total del conjunto ${cantidad}/${tamaño}, página ${pagina}`); assert.equal(r.meta.pagina, pagina,`Página del conjunto ${cantidad}/${tamaño}`); assert.equal(r.meta.porPagina, tamaño);
        assert.equal(r.data.length, Math.min(tamaño, Math.max(0, cantidad - (pagina - 1) * tamaño)), `Filas ${cantidad}/${tamaño}`);
        for (const fila of r.data) { assert.ok(!vistos.has(fila.id)); vistos.add(fila.id); }
      }
      assert.equal(vistos.size, cantidad);
      const ultima = await api(`/productos?q=${encodeURIComponent(`[n=${cantidad}]`)}&page=999999&pageSize=${tamaño}`);
      assert.equal(ultima.meta.pagina, paginas);
      resultados.conjuntos.push({ cantidad, tamaño, paginas, sinDuplicados: true });
    }
    console.log('✓ PostgreSQL/API: 0, 1, 5, 6, 15, 16, 100 y 1000; páginas de 5/15 completas y acotadas');

    for (const ancho of [360, 390, 768, 1024, 1366, 1920]) {
      const contextoVisual = await navegador.newContext({ viewport: { width: ancho, height: 900 }, isMobile: ancho < 1024, hasTouch: ancho < 1024 });
      await contextoVisual.addCookies(await contexto.cookies());
      const pagina = await contextoVisual.newPage();
      pagina.on('pageerror', e => resultados.errores.push(e.message));
      pagina.on('response', r => { if(r.url().includes('/api/v1/') && r.status()>=400) resultados.errores.push(`${r.status()} ${r.url()}`); });
      const modulos = [];
      try {
        for (const modulo of ['pedidos', 'inventario', 'creditos', 'compras', 'precios', 'caja', 'cierre', 'usuarios', 'auditoria']) {
          await pagina.goto(base + '/admin/' + modulo);
          if (modulo === 'inventario') await pagina.getByRole('button', { name: /Stock general/ }).click();
          const lista = pagina.locator('.lista-datos').first(); await lista.waitFor();
          await pagina.waitForTimeout(150);
          const paginador = pagina.getByRole('navigation', { name: 'Paginación' }).first(); await paginador.waitFor();
          await pagina.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Cargando'));
          const medidas = await pagina.evaluate(() => {
            const lista = document.querySelector('.lista-datos'), paginador = document.querySelector('nav[aria-label="Paginación"]');
            const l = lista.getBoundingClientRect(), p = paginador.getBoundingClientRect();
            return { horizontal: document.documentElement.scrollWidth <= innerWidth, alto: l.height, paginaSobreLista: p.bottom <= l.top + 1, margenInferior: parseFloat(getComputedStyle(document.querySelector('.admin-pantalla')).paddingBottom), centrado: Math.abs((p.left + p.right) / 2 - (l.left + l.right) / 2) < 3 };
          });
          assert.ok(medidas.horizontal, `${modulo}/${ancho}: sin desborde horizontal`);
          assert.ok(medidas.paginaSobreLista, `${modulo}/${ancho}: paginador sobre lista ${JSON.stringify(medidas)}`);
          assert.ok(medidas.centrado, `${modulo}/${ancho}: paginador centrado ${JSON.stringify(medidas)}`);
          assert.ok(medidas.margenInferior >= 12, `${modulo}/${ancho}: margen inferior`);
          await pagina.screenshot({ path: `.local/pruebas-criterios/${modulo}-${ancho}.png` });
          modulos.push({ modulo, ...medidas });
        }
        await pagina.goto(base+'/admin/precios');
        const lista=pagina.locator('.lista-datos').first(), nav=pagina.getByRole('navigation',{name:'Paginación'}).first();
        const tamaño=ancho<1024 ? 5 : 15;
        for(const cantidad of cantidades) {
          await pagina.getByPlaceholder('Buscar por nombre, código o categoría').fill(`[n=${cantidad}]`);
          await pagina.waitForFunction(n=>document.querySelector('nav[aria-label="Paginación"] p')?.textContent?.endsWith(`· ${n} registro(s)`),cantidad);
          await pagina.waitForFunction(n=>document.querySelector('.lista-datos')?.querySelectorAll(':scope > button').length===n,Math.min(cantidad,tamaño));
          const alto=await lista.evaluate(e=>e.getBoundingClientRect().height);
          if(cantidad<=1) assert.ok(alto<200,`Contenedor ajustado ${cantidad}/${ancho}: ${alto}`);
        }
        if(ancho===390) {
          const puntos=await nav.boundingBox();
          const clienteCDP=await contextoVisual.newCDPSession(pagina);
          async function gesto(x,y,dx,dy) {
            await clienteCDP.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
            for(let paso=1;paso<=5;paso++) await clienteCDP.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*paso/5,y:y+dy*paso/5}]});
            await clienteCDP.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          }
          const x=puntos.x+puntos.width*0.7,y=puntos.y+puntos.height/2;
          await gesto(x,y,-100,0);
          await nav.getByText(/^2\//).waitFor();
          await gesto(x-100,y,100,0);
          await nav.getByText(/1\//).waitFor();
          await gesto(x,y,0,-80);
          assert.match(await nav.innerText(),/1\//);
          await nav.getByRole('button',{name:'Página siguiente'}).click();
          await nav.getByText(/^2\//).waitFor();
          await nav.getByRole('button',{name:'Página anterior'}).click();
          await nav.getByText(/1\//).waitFor();
          resultados.interacciones.push({ancho,gestosHorizontales:true,verticalSinCambiarPagina:true,controles:true});
          const producto=(await api(`/productos?q=${encodeURIComponent('[n=1000]')}&orden=nombre&pageSize=5`)).data[0];
          const cambiosAntes=Number(sql(`SELECT count(*) FROM "cambiosPrecio" WHERE "productoId"='${producto.id}';`));
          await lista.locator(':scope > button').first().click();
          const nuevo=producto.precioVenta+1;
          await pagina.locator('input[type=number]').fill(String(nuevo));
          await pagina.getByRole('button',{name:'Revisar y confirmar →'}).click();
          await pagina.getByRole('button',{name:'Guardar precio',exact:true}).click();
          await lista.waitFor();
          await pagina.waitForFunction(n=>document.querySelector('.lista-datos > button span.font-mono')?.textContent?.replace(/\D/g,'')===String(n),nuevo);
          assert.equal((await api(`/productos/${producto.id}`)).data.precioVenta,nuevo);
          assert.equal(Number(sql(`SELECT "precioVenta" FROM productos WHERE id='${producto.id}';`)),nuevo);
          assert.equal(Number(sql(`SELECT count(*) FROM "cambiosPrecio" WHERE "productoId"='${producto.id}';`)),cambiosAntes+1);
          resultados.interacciones.push({ancho,precioFormularioApiBd:true,historialUnaSolaVez:true});

          await pagina.goto(base+'/admin/ventas/pedido');
          await pagina.getByText('Venta abierta · cliente ocasional',{exact:true}).click();
          await pagina.getByPlaceholder('Buscar producto o código').fill('[n=1000]');
          const paginasProductos=pagina.getByRole('navigation',{name:'Paginación'});
          await paginasProductos.locator('[aria-label*="1000 registros"]').waitFor();
          await pagina.getByRole('button',{name:/^Agregar /}).first().click();
          const respuestaPagina=pagina.waitForResponse(r=>r.url().includes('/productos?') && new URL(r.url()).searchParams.get('page')==='2' && r.status()===200);
          await paginasProductos.getByRole('button',{name:'Página siguiente'}).click();
          await respuestaPagina;
          await pagina.getByRole('button',{name:/^Agregar /}).first().click();
          await pagina.getByRole('button',{name:/Continuar a entrega/}).click();
          await pagina.getByRole('button',{name:/Continuar al pago/}).click();
          assert.equal(await pagina.getByRole('region',{name:'Detalle de productos'}).locator('li').count(),2,'Conserva ambos productos al cambiar de página');
          resultados.interacciones.push({ancho,carritoEntrePaginas:true,lineasConservadas:2,sinConfirmarVenta:true});
        }
      } finally { await contextoVisual.close(); }
      resultados.resoluciones.push({ ancho, modulos });
      console.log(`✓ Resolución ${ancho}: nueve módulos`);
    }
    assert.deepEqual(resultados.errores, []);
  } finally {
    writeFileSync('.local/pruebas-criterios/resultados.json', JSON.stringify(resultados, null, 2));
    await contexto.close(); await navegador.close();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
