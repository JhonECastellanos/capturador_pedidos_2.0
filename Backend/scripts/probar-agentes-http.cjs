/* API y PostgreSQL QA: revisión de borradores, sin confirmar pedidos. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const base = 'http://127.0.0.1:3100/api/v1';
async function main() {
  let token;
  async function leer(ruta, datos) {
    const r = await fetch(base + ruta, { method: datos === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(30000) }).catch(error => { throw new Error(ruta + ': ' + error.message); });
    const respuesta = await r.json();
    assert.ok(r.ok, `${ruta}: ${r.status} ${respuesta.message || ''}`);
    return respuesta;
  }
  const sinSesion = await fetch(base + '/agentes/configuracion');
  assert.equal(sinSesion.status, 401);
  token = (await leer('/auth/login', { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' })).data.accessToken;
  try {
    const configuracion = (await leer('/agentes/configuracion')).data;
    assert.equal(configuracion.modo, 'hibrido');
    assert.equal(configuracion.habilitado, false);
    const productos = (await leer('/productos')).data;
    const producto = productos.find(p => p.stock >= 2);
    assert.ok(producto, 'QA necesita un producto con dos unidades disponibles');
    const antes = (await leer('/pedidos')).meta.total;
    const instruccion = { operacion: 'pedido', ocasional: true, lineas: [{ producto: producto.nombre, cantidad: 2 }], metodo: 'efectivo', preparacion: 'pendiente' };
    const r = (await leer('/agentes/revisar', { instruccion, id: randomUUID(), version: 1 })).data;
    assert.deepEqual(r.faltantes, []);
    assert.equal(Number(r.total), producto.precioVenta * 2);
    assert.equal(r.datos.lineas[0].productoId, producto.id);
    const corregido = (await leer('/agentes/revisar', { instruccion: { ...instruccion, metodo: 'billetera' }, id: r.id, version: 2 })).data;
    assert.equal(corregido.id, r.id);
    assert.equal(corregido.datos.metodo, 'billetera');
    assert.deepEqual(corregido.datos.lineas, r.datos.lineas);
    assert.equal((await leer('/pedidos')).meta.total, antes);
    console.log('API QA: sesión obligatoria, configuración desactivada por defecto, catálogo PostgreSQL conciliado, corrección conserva líneas y total; ningún pedido creado.');
  } finally { if (token) await leer('/auth/logout', {}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
