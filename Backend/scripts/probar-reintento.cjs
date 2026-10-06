const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const base = 'http://localhost:8180/api/v1';
async function main() {
  let token;
  async function pedir(ruta, datos, clave) {
    const respuesta = await fetch(base + ruta, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(clave ? { 'Idempotency-Key': clave } : {}) }, body: JSON.stringify(datos) });
    const cuerpo = await respuesta.json();
    assert.ok(respuesta.ok, `${ruta}: ${respuesta.status} ${cuerpo.message || ''}`);
    return cuerpo.data;
  }
  token = (await pedir('/auth/login', { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' })).accessToken;
  try {
    const marca = `Reintento ${Date.now()}`;
    const producto = await pedir('/productos', { nombre: marca, precioVenta: 1000, costoActual: 400, stock: 12 });
    const datos = { clienteId: null, lineas: [{ productoId: producto.id, cantidad: 1 }], metodo: 'efectivo', estadoInicial: 'entregado' };
    // Reproduce el reenvío del mismo documento; no corta una conexión real.
    const clave = randomUUID();
    const primero = await pedir('/pedidos', datos, clave);
    const segundo = await pedir('/pedidos', datos, clave);
    assert.deepEqual(segundo, primero, 'El reenvío devuelve la confirmación original');
    const concurrentes = await Promise.all(Array.from({ length: 8 }, () => pedir('/pedidos', datos, clave)));
    assert.ok(concurrentes.every(p => p.id === primero.id));
    const otraClave = randomUUID();
    const nuevosConcurrentes = await Promise.all(Array.from({ length: 8 }, () => pedir('/pedidos', datos, otraClave)));
    assert.ok(nuevosConcurrentes.every(p => p.id === nuevosConcurrentes[0].id));
    assert.notEqual(nuevosConcurrentes[0].id, primero.id, 'Una nueva intención permite otra venta idéntica');
    const conflicto = await fetch(base + '/pedidos', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': clave }, body: JSON.stringify({ ...datos, metodo: 'billetera' }) });
    assert.equal(conflicto.status, 409);
    const rollbackClave = randomUUID();
    const invalido = { ...datos, lineas: [{ productoId: producto.id, cantidad: 1000 }] };
    const rechazado = await fetch(base + '/pedidos', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': rollbackClave }, body: JSON.stringify(invalido) });
    assert.equal(rechazado.status, 400);
    // El intento rechazado se revierte por completo y no ocupa la clave.
    const trasRollback = await pedir('/pedidos', datos, rollbackClave);
    const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
    const usuario = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
    const sql = consulta => execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuario, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim();
    assert.equal(sql(`SELECT count(*) FROM "pedidoLineas" WHERE "productoId"='${producto.id}';`), '3');
    assert.equal(sql(`SELECT count(*) FROM "pagoAplicaciones" a JOIN "pedidoLineas" l ON l."pedidoId"=a."pedidoId" WHERE l."productoId"='${producto.id}';`), '3');
    assert.equal(sql(`SELECT "stockFisico" FROM productos WHERE id='${producto.id}';`), '9');
    assert.equal(sql(`SELECT count(*) FROM "reservasStock" WHERE "productoId"='${producto.id}' AND estado='consumida' AND "cantidadConsumida"="cantidadReservada" AND "cantidadLiberada"=0;`), '3');
    const pendiente = await pedir('/pedidos', { ...datos, estadoInicial: 'pendiente' }, randomUUID());
    const cambio = await fetch(base + `/pedidos/${pendiente.id}/estado`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ estado: 'cancelado' }) });
    assert.equal(cambio.status, 200);
    assert.equal(sql(`SELECT count(*) FROM "reservasStock" WHERE "pedidoId"='${pendiente.id}' AND estado='liberada' AND "cantidadLiberada"="cantidadReservada" AND "cantidadConsumida"=0;`), '1');
    const informe = { fecha: new Date().toISOString(), base, primerPedido: primero.numero, segundoPedido: segundo.numero, documentosDistintos: primero.id !== segundo.id, solicitudes: 23, pedidosConfirmados: 4, ventasEntregadas: 3, pedidoCancelado: pendiente.numero, trasRollback: trasRollback.numero, alcance: 'Reintentos secuenciales y simultáneos, clave reutilizada con otros datos, rollback y una nueva intención. Comprobación directa de pedidos, pagos, stock y cantidades de reservas consumidas/liberadas en PostgreSQL.', hallazgo: 'Cada clave confirmada conserva un único pedido y un único cobro. Un intento rechazado no deja datos parciales.' };
    mkdirSync('.local/pruebas-persistencia', { recursive: true });
    writeFileSync('.local/pruebas-persistencia/reintento.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify(informe, null, 2));
  } finally { await pedir('/auth/logout', {}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
