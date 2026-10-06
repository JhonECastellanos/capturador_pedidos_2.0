const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
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
    const producto = await pedir('/productos', { nombre: marca, precioVenta: 1000, costoActual: 400, stock: 2 });
    const datos = { clienteId: null, lineas: [{ productoId: producto.id, cantidad: 1 }], metodo: 'efectivo', estadoInicial: 'entregado' };
    // Reproduce el reenvío del mismo documento; no corta una conexión real.
    const primero = await pedir('/pedidos', datos, marca);
    const segundo = await pedir('/pedidos', datos, marca);
    const informe = { fecha: new Date().toISOString(), base, primerPedido: primero.numero, segundoPedido: segundo.numero, documentosDistintos: primero.id !== segundo.id, alcance: 'Dos solicitudes idénticas con la misma clave de reintento. No simula pérdida real de red.', hallazgo: primero.id !== segundo.id ? 'La API crea dos pedidos al reenviar la misma solicitud. La cabecera Idempotency-Key no ofrece protección. Una respuesta perdida seguida de un reintento puede duplicar la venta y el cobro.' : 'La API conserva un único pedido al repetir la solicitud.' };
    mkdirSync('.local/pruebas-persistencia', { recursive: true });
    writeFileSync('.local/pruebas-persistencia/reintento.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify(informe, null, 2));
  } finally { await pedir('/auth/logout', {}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
