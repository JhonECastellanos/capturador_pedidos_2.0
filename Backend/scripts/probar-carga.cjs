const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const base = process.env.BASE_PRUEBAS_API || 'http://localhost:8180/api/v1';
assert.ok(['http://localhost:3100/api/v1', 'http://localhost:8180/api/v1'].includes(base), 'Solo QA aislado');
const tiempos = [];
async function http(ruta, token, metodo = 'GET', datos) {
  const inicio = performance.now();
  const r = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json', ...(metodo !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {}) }, body: datos === undefined ? undefined : JSON.stringify(datos) });
  const cuerpo = await r.json();
  return { status: r.status, cuerpo, ms: performance.now() - inicio };
}
async function pedir(ruta, token, metodo, datos) {
  const r = await http(ruta, token, metodo, datos);
  assert.ok(r.status >= 200 && r.status < 300, `${metodo || 'GET'} ${ruta}: ${r.status} ${r.cuerpo.message || ''}`);
  return r.cuerpo.data;
}
async function lote(nombre, cantidad, concurrencia, tarea) {
  let indice = 0; const duraciones = [], fallos = [], resultados = [];
  const inicio = performance.now();
  await Promise.all(Array.from({ length: concurrencia }, async () => {
    while (indice < cantidad) {
      const i = indice++;
      try { const r = await tarea(i); duraciones.push(r.ms); assert.ok(r.status >= 200 && r.status < 300, `HTTP ${r.status}`); resultados.push(r.cuerpo.data); }
      catch (e) { fallos.push(e.message); }
    }
  }));
  const segundos = (performance.now() - inicio) / 1000;
  duraciones.sort((a, b) => a - b);
  const informe = { nombre, solicitudes: cantidad, concurrencia, exitos: resultados.length, errores: fallos.length, solicitudesSegundo: +(cantidad / segundos).toFixed(2), p95ms: Math.round(duraciones[Math.max(0, Math.ceil(duraciones.length * .95) - 1)] || 0) };
  tiempos.push(informe); console.log(JSON.stringify(informe));
  assert.equal(fallos.length, 0, fallos.slice(0, 3).join('; ')); return resultados;
}
async function main() {
  const login = async rol => (await pedir('/auth/login', '', 'POST', { identifier: `qa-${rol}@pruebas.invalid`, password: 'SoloPruebas2026!' })).accessToken;
  const admin = await login('admin'), vendedor = await login('vendedor');
  try {
    assert.equal((await http('/sincronizacion/revision')).status, 401);
    const antes = await pedir('/sincronizacion/revision', admin);
    const marca = `CARGA-${Date.now()}`;
    const cliente = await pedir('/clientes', vendedor, 'POST', { nombre: marca, telefono: '3000000000', direccion: 'Pruebas de carga QA' });
    const producto = await pedir('/productos', admin, 'POST', { nombre: marca, precioVenta: 10, costoActual: 4, stock: 170 });
    const pedidos = [];
    for (const [cantidad, concurrencia] of [[20, 5], [50, 10], [100, 20]]) {
      pedidos.push(...await lote('pedidos', cantidad, concurrencia, () => http('/pedidos', vendedor, 'POST', { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 1 }], metodo: 'credito', estadoInicial: 'pendiente' })));
    }
    assert.equal(new Set(pedidos.map(p => p.id)).size, 170);
    assert.equal(new Set(pedidos.map(p => p.numero)).size, 170);
    await lote('lecturas administrador/vendedor', 300, 30, i => http(`/pedidos/${pedidos[i % pedidos.length].id}`, i % 2 ? admin : vendedor));
    await lote('revisión compartida', 300, 30, i => http('/sincronizacion/revision', i % 2 ? admin : vendedor));
    const final = await pedir(`/productos/${producto.id}`, admin);
    assert.equal(final.stockFisico, 170); assert.equal(final.stockReservado, 170);
    const totales = await pedir(`/dashboard/totales?clienteId=${cliente.id}`, admin);
    assert.equal(totales.ventas, 1700); assert.equal(totales.creditoPendiente, 1700);
    const despues = await pedir('/sincronizacion/revision', vendedor);
    assert.notEqual(despues.revision, antes.revision);
    const rechazo = await http('/pedidos', vendedor, 'POST', { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 1 }], metodo: 'credito' });
    assert.ok(rechazo.status >= 400 && rechazo.status < 500);
    assert.equal((await pedir(`/productos/${producto.id}`, admin)).stockReservado, 170);
    console.log('✓ 170 pedidos únicos persistidos; lectura cruzada, totales, reservas y rechazo de sobreventa consistentes. Los resultados describen esta carga, no una capacidad máxima.');
  } finally {
    await pedir('/auth/logout', admin, 'POST', {});
    await pedir('/auth/logout', vendedor, 'POST', {});
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
