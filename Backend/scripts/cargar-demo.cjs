// Catálogo optativo; nunca se ejecuta desde la semilla ni al arrancar la API.
const assert = require('node:assert/strict');
const catalogo = require('../../scripts/fixtures/catalogo-demo.json');

async function cargarDemo(base, token, conPedidos = true) {
  assert.ok(['http://localhost:3100/api/v1', 'http://localhost:8180/api/v1', 'http://localhost:8080/api/v1'].includes(base), 'Solo instalaciones locales de demostración o QA');
  async function pedir(ruta, metodo = 'GET', datos) {
    const res = await fetch(base + ruta, { method: metodo, headers: { Authorization: `Bearer ${token}`, ...(datos ? { 'Content-Type': 'application/json' } : {}) }, body: datos ? JSON.stringify(datos) : undefined, signal: AbortSignal.timeout(20000) });
    const cuerpo = await res.json(); assert.ok(res.ok, `${metodo} ${ruta}: ${res.status}`); return cuerpo;
  }
  async function todos(ruta) {
    const filas = [];
    for (let page = 1; ; page++) {
      const cuerpo = await pedir(`${ruta}?page=${page}&pageSize=200`); filas.push(...cuerpo.data);
      if (!cuerpo.meta || filas.length >= cuerpo.meta.total || !cuerpo.data.length) return filas;
    }
  }
  const productosAntes = await todos('/productos'), clientesAntes = await todos('/clientes');
  const productos = [], clientes = [];
  for (const producto of catalogo.productos) {
    const encontrado = productosAntes.find(p => p.nombre === producto.nombre);
    productos.push(encontrado || (await pedir('/productos', 'POST', producto)).data);
  }
  for (const cliente of catalogo.clientes) {
    const encontrado = clientesAntes.find(c => c.nombre === cliente.nombre && c.telefono === cliente.telefono);
    clientes.push(encontrado || (await pedir('/clientes', 'POST', cliente)).data);
  }
  const pedidos = await todos('/pedidos');
  if (conPedidos) for (let i = 0; i < clientes.length; i++) {
    // Una combinación distinta por cliente; repetir no duplica el pedido demo.
    const lineas = [{ productoId: productos[i].id, cantidad: i % 3 + 1 }, { productoId: productos[16 + i].id, cantidad: 1 }];
    if (!pedidos.some(p => p.clienteId === clientes[i].id && lineas.every(l => p.lineas.some(x => x.productoId === l.productoId && x.cantidad === l.cantidad)))) {
      pedidos.push((await pedir('/pedidos', 'POST', { clienteId: clientes[i].id, lineas, metodo: ['efectivo', 'billetera', 'credito'][i % 3], estadoInicial: i % 2 ? 'pendiente' : 'entregado' })).data);
    }
  }
  return { productos, clientes, pedidos };
}
module.exports = { cargarDemo };

if (require.main === module) (async () => {
  const base = process.env.BASE_PRUEBAS_API || 'http://localhost:3100/api/v1';
  if (base === 'http://localhost:8080/api/v1') assert.ok(process.argv.includes('--demo-local-autorizado'), 'No cargar ejemplos en el negocio sin autorización explícita');
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD }) });
  assert.ok(res.ok, 'No se pudo autenticar system');
  const { data: sesion } = await res.json();
  const resultado = await cargarDemo(base, sesion.accessToken, !process.argv.includes('--solo-catalogo'));
  console.log(`Catálogo ficticio preparado: ${resultado.productos.length} productos, ${resultado.clientes.length} clientes. Pedidos visibles: ${resultado.pedidos.length}.`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
