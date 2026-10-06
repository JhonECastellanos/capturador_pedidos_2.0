const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const base = 'http://localhost:8180/api/v1';

async function main() {
  let token;
  const casos = [];
  async function pedir(ruta, metodo = 'GET', datos, status = metodo === 'POST' ? 201 : 200, clave = randomUUID()) {
    const r = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(30000), headers: { ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(metodo !== 'GET' ? { 'Idempotency-Key': clave } : {}) }, body: datos === undefined ? undefined : JSON.stringify(datos) });
    const cuerpo = await r.json();
    assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(cuerpo)}`);
    return cuerpo.data;
  }
  token = (await pedir('/auth/login', 'POST', { identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' }, 200)).accessToken;
  try {
    let inicial = await pedir('/inventario/inicial');
    if (!inicial) {
      const pendientes = await pedir('/inventario/conteos');
      for (const c of pendientes.filter(c => c.tipo === 'inicial' && c.estado !== 'cancelado')) await pedir(`/inventario/conteos/${c.id}/cancelar`, 'POST');
      const c = await pedir('/inventario/conteos', 'POST', { tipo: 'inicial', turno: 'mañana' });
      await pedir('/inventario/conteos', 'POST', { tipo: 'inicial', turno: 'tarde' }, 409);
      await pedir(`/inventario/conteos/${c.id}/finalizar`, 'POST', undefined, 400);
      casos.push('Inicio único y rechazo del conteo incompleto');
      const productos = await pedir('/productos?pageSize=200');
      assert.ok(productos.length >= c.lineas.length, 'El catálogo QA cabe en la consulta de preparación');
      const porId = new Map(productos.map(p => [p.id, p]));
      const completar = async conteo => {
        // El candado de conteo serializa estos guardados y su finalización.
        for (let i = 0; i < conteo.lineas.length; i += 8) await Promise.all(conteo.lineas.slice(i, i + 8).map(l => pedir(`/inventario/conteos/${conteo.id}/lineas/${l.productoId}`, 'PATCH', { stockFisico: porId.get(l.productoId).stockFisico })));
      };
      await completar(c);
      const prueba = productos.find(p => p.stockFisico >= p.stockReservado);
      await pedir('/inventario/ajustes', 'POST', { productoId: prueba.id, stockFisico: prueba.stockFisico + 1, motivo: 'Verificar cambio durante el inicio' });
      await pedir(`/inventario/conteos/${c.id}/finalizar`, 'POST');
      await pedir(`/inventario/conteos/${c.id}/aplicar-ajuste`, 'POST', undefined, 409);
      await pedir(`/inventario/conteos/${c.id}/cancelar`, 'POST');
      casos.push('Cambio de stock: aplicación rechazada sin datos parciales y reinicio permitido');
      porId.set(prueba.id, { ...prueba, stockFisico: prueba.stockFisico + 1 });
      const nuevo = await pedir('/inventario/conteos', 'POST', { tipo: 'inicial', turno: 'mañana' });
      await completar(nuevo);
      // Prueba que aplicar establece el físico, sin sumar otra vez el inventario.
      await pedir(`/inventario/conteos/${nuevo.id}/lineas/${prueba.id}`, 'PATCH', { stockFisico: prueba.stockFisico + 3 });
      await pedir(`/inventario/conteos/${nuevo.id}/finalizar`, 'POST');
      const clave = randomUUID();
      const [a, b] = await Promise.all([pedir(`/inventario/conteos/${nuevo.id}/aplicar-ajuste`, 'POST', undefined, 201, clave), pedir(`/inventario/conteos/${nuevo.id}/aplicar-ajuste`, 'POST', undefined, 201, clave)]);
      assert.deepEqual(a, b);
      inicial = await pedir('/inventario/inicial');
      casos.push('Confirmación simultánea: un ajuste, costos históricos y cantidades de partida');
    } else casos.push('Se conserva el inicio confirmado en una ejecución anterior; no se elimina');
    assert.equal(inicial.diferencias, 0);
    await pedir('/inventario/conteos', 'POST', { tipo: 'inicial', turno: 'mañana' }, 409);
    await pedir(`/inventario/conteos/${inicial.conteoId}/cancelar`, 'POST', undefined, 400);
    await pedir(`/inventario/conteos/${inicial.conteoId}/aplicar-ajuste`, 'POST', undefined, 409);
    const linea = inicial.lineas.find(l => l.stockActual > 0);
    assert.ok(linea);
    await pedir(`/inventario/conteos/${inicial.conteoId}/lineas/${linea.productoId}`, 'PATCH', { stockFisico: 0 }, 400);
    casos.push('El inicio aplicado no permite reemplazo, cancelación ni editar cantidades');
    const productos = await pedir('/productos?pageSize=200');
    const producto = productos.find(p => p.id === linea.productoId);
    const proveedor = await pedir('/proveedores', 'POST', { nombre: `Inicio ${Date.now()}` });
    const claveCompra = randomUUID();
    const compra = { proveedorId: proveedor.id, lineas: [{ productoId: producto.id, cantidad: 2, costoUnitario: 700 }], descontarCaja: false };
    const r1 = await pedir('/recepciones-compra', 'POST', compra, 201, claveCompra);
    const r2 = await pedir('/recepciones-compra', 'POST', compra, 201, claveCompra);
    assert.equal(r1.id, r2.id);
    const datos = await pedir(`/inventario/inicial?q=${encodeURIComponent(linea.nombre)}`);
    const despues = datos.lineas.find(l => l.productoId === producto.id);
    assert.equal(despues.stockActual, linea.stockActual + 2);
    assert.equal(despues.movimientoNeto, linea.movimientoNeto + 2);
    assert.equal(despues.stockInicial, linea.stockInicial);
    assert.equal(despues.costoUnitarioInicial, linea.costoUnitarioInicial);
    assert.equal(datos.valorInicial, inicial.valorInicial);
    assert.equal(datos.diferencias, 0);
    casos.push('Compra repetida: una recepción; suma dos unidades y mantiene el costo y valor iniciales');
    assert.ok(datos.lineas.length <= 30);
    if (inicial.productos > 30) { const pagina2 = await pedir('/inventario/inicial?page=2'); assert.ok(pagina2.lineas.length > 0 && pagina2.lineas.length <= 30); assert.equal(pagina2.valorInicial, inicial.valorInicial); }
    casos.push('Buscador y páginas de 30 no recortan los totales');
    const compose = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
    const usuario = execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER'], { encoding: 'utf8' }).trim();
    const sql = consulta => execFileSync('docker.exe', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', usuario, '-d', 'ambie_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim();
    assert.equal(sql(`SELECT count(*) FROM "ajustesInventario" WHERE "conteoId"='${inicial.conteoId}';`), '1');
    assert.equal(Number(sql(`SELECT SUM("stockFisico" * "costoUnitarioInicial") FROM "conteoLineas" WHERE "conteoId"='${inicial.conteoId}';`)), inicial.valorInicial);
    const informe = { fecha: new Date().toISOString(), base, casos, conteoId: inicial.conteoId, productos: inicial.productos, valorInicial: inicial.valorInicial, diferencias: datos.diferencias };
    mkdirSync('.local/pruebas-persistencia', { recursive: true });
    writeFileSync('.local/pruebas-persistencia/inventario-inicial.json', JSON.stringify(informe, null, 2));
    console.log(JSON.stringify(informe, null, 2));
  } finally { await pedir('/auth/logout', 'POST', {}, 200); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
