import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultas, claveConsulta, limpiarConsultas } from '../Frontend/src/data/query.ts';

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
