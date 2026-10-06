const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { mkdirSync, writeFileSync } = require('node:fs');

const base = process.env.BASE_PRUEBAS_API || 'http://localhost:8180/api/v1';
assert.ok(['http://localhost:3100/api/v1', 'http://localhost:8180/api/v1'].includes(base), 'Usa solamente la instalación de pruebas');
const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
const usuario = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
function sql(consulta) {
  return execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuario, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim();
}
async function main() {
  let token;
  async function pedir(ruta, metodo = 'GET', datos) {
    const inicio = performance.now();
    const respuesta = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: datos === undefined ? undefined : JSON.stringify(datos) });
    const cuerpo = await respuesta.json();
    assert.ok(respuesta.ok, `${metodo} ${ruta}: ${respuesta.status} ${cuerpo.message || ''}`);
    return { datos: cuerpo.data, ms: performance.now() - inicio };
  }
  token = (await pedir('/auth/login', 'POST', { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' })).datos.accessToken;
  const marca = `Persistencia ${Date.now()}`;
  const cliente = (await pedir('/clientes', 'POST', { nombre: marca, telefono: '3000000000', direccion: 'Dirección de pruebas' })).datos;
  const producto = (await pedir('/productos', 'POST', { nombre: marca, precioVenta: 1200, costoActual: 400, stock: 30 })).datos;
  const muestras = [];
  try {
    for (let i = 0; i < 30; i++) {
      const inicio = performance.now();
      const respuesta = await pedir('/pedidos', 'POST', { clienteId: cliente.id, lineas: [{ productoId: producto.id, cantidad: 1 }], metodo: 'credito', estadoInicial: 'pendiente' });
      assert.match(respuesta.datos.id, /^[a-f0-9-]{36}$/i);
      const lecturaInicio = performance.now();
      assert.equal(sql(`SELECT count(*) FROM pedidos p JOIN "pedidoLineas" l ON l."pedidoId"=p.id WHERE p.id='${respuesta.datos.id}' AND p.total=1200 AND l.cantidad=1;`), '1', 'El pedido y sus líneas deben estar confirmados al recibir la respuesta');
      const bdObservadaMs = performance.now() - inicio;
      const consultaBdMs = performance.now() - lecturaInicio;
      const lectura = await pedir(`/pedidos/${respuesta.datos.id}`);
      assert.equal(Number(lectura.datos.total), 1200);
      muestras.push({ respuestaMs: +respuesta.ms.toFixed(2), bdObservadaMs: +bdObservadaMs.toFixed(2), consultaBdMs: +consultaBdMs.toFixed(2), lecturaApiMs: +lectura.ms.toFixed(2) });
    }
    assert.equal(sql(`SELECT count(*) FROM pedidos WHERE "clienteId"='${cliente.id}';`), '30');
    const resumen = campo => { const valores = muestras.map(m => m[campo]).sort((a, b) => a - b); return { minimo: valores[0], mediana: valores[14], p95: valores[28], maximo: valores[29] }; };
    const informe = { fecha: new Date().toISOString(), base, cantidad: muestras.length, respuestaMs: resumen('respuestaMs'), bdObservadaMs: resumen('bdObservadaMs'), lecturaApiMs: resumen('lecturaApiMs'), alcance: 'La respuesta de escritura incluye la confirmación de la transacción. La observación directa posterior incluye el arranque del cliente Docker y psql; no mide el instante exacto del commit ni la actualización visual.', muestras };
    mkdirSync('.local/pruebas-persistencia', { recursive: true });
    writeFileSync('.local/pruebas-persistencia/resultado.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify({ ...informe, muestras: undefined }, null, 2));
  } finally { await pedir('/auth/logout', 'POST', {}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
