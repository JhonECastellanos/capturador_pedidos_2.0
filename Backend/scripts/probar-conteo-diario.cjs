const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const base = 'http://localhost:8180/api/v1';
const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
const usuarioBd = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
const sql = consulta => execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuarioBd, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: consulta }).trim();

async function main() {
  let token;
  const casos = [], tiempos = [];
  async function pedir(ruta, metodo = 'GET', datos, esperado = metodo === 'POST' ? 201 : 200) {
    const inicio = performance.now();
    const r = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(30000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }), ...(metodo === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }) }, body: datos === undefined ? undefined : JSON.stringify(datos) });
    const cuerpo = await r.json();
    assert.equal(r.status, esperado, `${metodo} ${ruta}: ${JSON.stringify(cuerpo)}`);
    if (metodo === 'PATCH') tiempos.push(performance.now() - inicio);
    return cuerpo;
  }
  token = (await pedir('/auth/login', 'POST', { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD }, 200)).data.accessToken;
  const catalogoPrevio = JSON.parse(sql('SELECT COALESCE(json_agg(id),\'[]\') FROM productos WHERE activo;'));
  const limite = Number(process.env.CONTEO_PRUEBA_MAX_PRODUCTOS || 0);
  assert.ok(Number.isInteger(limite) && limite >= 0 && limite <= 64, 'Límite QA entre cero y 64; cero usa el catálogo completo');
  try {
    const producto = (await pedir('/productos', 'POST', { nombre: `Conteo cero ${Date.now()}`, precioVenta: 1000, stock: 3 })).data;
    if (limite) {
      const seleccion = [...catalogoPrevio.slice(0, limite), producto.id];
      sql(`UPDATE productos SET activo=false WHERE id NOT IN (${seleccion.map(id=>`'${id}'`).join(',')});`);
    }
    const general = (await pedir('/inventario/conteos', 'POST', { tipo: 'general', turno: 'Prueba de persistencia' })).data;
    const activos = Number(sql('SELECT count(*) FROM productos WHERE activo;'));
    assert.equal(general.lineas.length, activos);
    assert.ok(general.lineas.every(l => l.stockFisico === null));
    await pedir(`/inventario/conteos/${general.id}/lineas/${producto.id}`, 'PATCH', { stockFisico: 0 });
    const generalRecargado = (await pedir(`/inventario/conteos/${general.id}`)).data;
    assert.deepEqual(generalRecargado.lineas.map(l => l.productoId), general.lineas.map(l => l.productoId), 'Guardar y recargar mantiene el producto de cada paso');
    const linea = JSON.parse(sql(`SELECT row_to_json(l) FROM "conteoLineas" l WHERE "conteoId"='${general.id}' AND "productoId"='${producto.id}';`));
    assert.equal(linea.stockFisico, 0); assert.equal(linea.diferencia, -3); assert.ok(linea.contadoPorId && linea.contadoEn);
    assert.equal((await pedir(`/productos/${producto.id}`)).data.stockFisico, 3);
    await pedir(`/inventario/conteos/${general.id}/finalizar`, 'POST');
    assert.equal((await pedir(`/productos/${producto.id}`)).data.stockFisico, 3);
    await pedir(`/inventario/conteos/${general.id}/aplicar-ajuste`, 'POST');
    await pedir(`/inventario/conteos/${general.id}/aplicar-ajuste`, 'POST', undefined, 409);
    assert.equal((await pedir(`/productos/${producto.id}`)).data.stockFisico, 0);
    assert.equal(Number(sql(`SELECT count(*) FROM "ajustesInventario" WHERE "conteoId"='${general.id}';`)), 1);
    assert.equal(Number(sql(`SELECT count(*) FROM "movimientosInventario" WHERE "conteoId"='${general.id}';`)), 1);
    casos.push('General incluye todos; cero persiste con responsable; orden estable tras guardar; confirmar no aplica stock; aplicación parcial única con ledger');

    // Fechas simuladas solo en QA. El ciclo histórico se conserva.
    const ultimaFechaPrueba=sql('SELECT COALESCE(MAX("fechaDiaria"),DATE \'1980-01-01\')::text FROM "conteosInventario" WHERE "fechaDiaria"<DATE \'2000-01-01\';');
    const baseFecha=new Date(ultimaFechaPrueba+'T00:00:00Z').getTime()+86400000;
    const [a, b] = await Promise.all([pedir('/inventario/conteos', 'POST', { tipo: 'aleatorio', turno: 'Prueba diaria' }), pedir('/inventario/conteos', 'POST', { tipo: 'aleatorio', turno: 'Prueba diaria' })]);
    assert.equal(a.data.id, b.data.id);
    let conteo = a.data;
    if (conteo.estado === 'confirmado') {
      sql(`UPDATE "conteosInventario" SET "fechaDiaria"='${new Date(baseFecha).toISOString().slice(0,10)}' WHERE id='${conteo.id}';`);
      conteo = (await pedir('/inventario/conteos', 'POST', { tipo: 'aleatorio', turno: 'Prueba diaria' })).data;
    }
    await pedir(`/inventario/conteos/${conteo.id}/finalizar`, 'POST', undefined, 400);
    const cicloPrevio=Number(sql('SELECT COALESCE(MAX(l."cicloDiario"),1) FROM "conteoLineas" l JOIN "conteosInventario" c ON c.id=l."conteoId" WHERE c.estado=\'confirmado\';'));
    const coberturaPrevia=JSON.parse(sql(`SELECT COALESCE(json_agg(DISTINCT l."productoId"),'[]') FROM "conteoLineas" l JOIN "conteosInventario" c ON c.id=l."conteoId" JOIN productos p ON p.id=l."productoId" WHERE c.estado='confirmado' AND p.activo AND l."cicloDiario"=${cicloPrevio};`));
    const vistos = new Set(coberturaPrevia), jornadas = Math.ceil(activos / 5), ids = [];
    for (let dia = 0; dia < jornadas; dia++) {
      if (dia) conteo = (await pedir('/inventario/conteos', 'POST', { tipo: 'aleatorio', turno: 'Prueba diaria' })).data;
      assert.equal(conteo.lineas.length, Math.min(5, activos));
      assert.equal(new Set(conteo.lineas.map(l => l.productoId)).size, conteo.lineas.length);
      for (const l of conteo.lineas) {
        const existentes = Number(sql(`SELECT count(*) FROM "conteoLineas" l JOIN "conteosInventario" c ON c.id=l."conteoId" WHERE c.estado='confirmado' AND l."cicloDiario"=${l.cicloDiario} AND l."productoId"='${l.productoId}';`));
        assert.equal(existentes, 0, 'Sin repetir un producto dentro del ciclo');
        await pedir(`/inventario/conteos/${conteo.id}/lineas/${l.productoId}`, 'PATCH', { stockFisico: l.stockTeorico });
        vistos.add(l.productoId);
      }
      await pedir(`/inventario/conteos/${conteo.id}/finalizar`, 'POST');
      ids.push(conteo.id);
      const fecha = new Date(baseFecha+(dia+1)*86400000).toISOString().slice(0, 10);
      sql(`UPDATE "conteosInventario" SET "fechaDiaria"='${fecha}' WHERE id='${conteo.id}';`);
      if ((dia + 1) % 10 === 0) console.log(`Conteos completados: ${dia + 1}/${jornadas}`);
    }
    assert.equal(vistos.size, activos, 'Cobertura en ceil(N/5) jornadas completadas');
    assert.equal(Number(sql(`SELECT count(*) FROM "ajustesInventario" WHERE "conteoId" IN (${ids.map(id => `'${id}'`).join(',')});`)), 0);
    casos.push(`Diario concurrente único; cinco distintos; cobertura de ${activos} productos en ${jornadas} jornadas simuladas; ningún ajuste automático`);
    const revision = await pedir('/sincronizacion/revision'); assert.ok(revision.data);
    tiempos.sort((a, b) => a - b);
    const informe = { fecha: new Date().toISOString(), base, casos, guardados: tiempos.length, p95GuardadoMs: +tiempos[Math.floor((tiempos.length - 1) * .95)].toFixed(1), productos: activos, coberturaPrevia: coberturaPrevia.length, jornadasSimuladas: jornadas, generalId: general.id, ultimoDiarioId: conteo.id };
    mkdirSync('.local/pruebas-persistencia', { recursive: true });
    writeFileSync('.local/pruebas-persistencia/conteo-diario.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify(informe, null, 2));
  } finally {
    if (limite) sql(`UPDATE productos SET activo=true WHERE id IN (${catalogoPrevio.map(id=>`'${id}'`).join(',')});`);
    await pedir('/auth/logout', 'POST', {}, 200);
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
