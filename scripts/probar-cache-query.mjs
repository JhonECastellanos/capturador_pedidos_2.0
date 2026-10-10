import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultas, claveConsulta, limpiarConsultas } from '../Frontend/src/data/query.ts';
import { replaceEqualDeep } from '@tanstack/react-query';
import { paginar, POR_PAGINA } from '../Frontend/src/utils/paginacion.ts';

test('snapshots idénticos conservan referencias y páginas muestran máximo 15 registros', () => {
  const antes = { clientes: [{ id: 'isabel', nombre: 'Isabel Rojas' }], productos: [{ id: 'pepsi', precio: 3000 }] };
  assert.equal(replaceEqualDeep(antes, structuredClone(antes)), antes);
  const despues = replaceEqualDeep(antes, { ...antes, productos: [{ id: 'pepsi', precio: 3500 }] });
  assert.equal(despues.clientes, antes.clientes); assert.notEqual(despues.productos, antes.productos);
  assert.equal(POR_PAGINA, 15);
  const filas = Array.from({ length: 65 }, (_, i) => i);
  assert.equal(paginar(filas, 1).items.length, 15); assert.equal(paginar(filas, 2).items.length, 15); assert.equal(paginar(filas, 5).items.length, 5);
});

test('React Query reutiliza lecturas, deduplica, invalida y aísla sesiones', async () => {
  limpiarConsultas();
  let llamadas = 0;
  const opciones = { queryKey: claveConsulta('/clientes?page=1'), queryFn: async () => { llamadas++; return { total: llamadas }; } };
  try {
    const [a, b] = await Promise.all([consultas.fetchQuery(opciones), consultas.fetchQuery(opciones)]);
    assert.equal(llamadas, 1); assert.deepEqual(a, b);
    await consultas.fetchQuery(opciones); assert.equal(llamadas, 1);
    await consultas.invalidateQueries({ queryKey: ['api'] });
    await consultas.fetchQuery(opciones); assert.equal(llamadas, 2);
    assert.notDeepEqual(claveConsulta('/clientes?page=1'), claveConsulta('/clientes?page=2'));
    const anterior = opciones.queryKey;
    limpiarConsultas(); assert.equal(consultas.getQueryCache().getAll().length, 0);
    assert.notDeepEqual(anterior, claveConsulta('/clientes?page=1'));
  } finally { limpiarConsultas(); }
});
