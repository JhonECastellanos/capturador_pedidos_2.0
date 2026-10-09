import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claveGuardado, resolverGuardado, limpiarGuardados } from '../Frontend/src/data/guardados.ts';

test('Un intento dudoso conserva la clave; confirmar o cambiar datos crea otra intención', async () => {
  limpiarGuardados();
  const datos = { lineas: [{ productoId: 'producto', cantidad: 1 }], metodo: 'efectivo' };
  const primera = await claveGuardado('/pedidos', 'POST', datos);
  const simultaneas = await Promise.all(Array.from({ length: 8 }, () => claveGuardado('/pedidos', 'POST', datos)));
  assert.ok(simultaneas.every(k => k.clave === primera.clave));
  assert.notEqual((await claveGuardado('/pedidos', 'POST', { ...datos, metodo: 'billetera' })).clave, primera.clave);
  resolverGuardado(primera);
  assert.notEqual((await claveGuardado('/pedidos', 'POST', datos)).clave, primera.clave);
  assert.equal(await claveGuardado('/auth/login', 'POST', { password: 'no-se-almacena' }), null);
  assert.equal(await claveGuardado('/productos', 'GET', undefined), null);
  limpiarGuardados();
});

test('Cerrar la sesión elimina los identificadores de sus intentos pendientes', async () => {
  const antes = await claveGuardado('/gastos', 'POST', { concepto: 'Prueba', monto: 1000 });
  limpiarGuardados();
  const despues = await claveGuardado('/gastos', 'POST', { concepto: 'Prueba', monto: 1000 });
  assert.notEqual(antes.clave, despues.clave);
  limpiarGuardados();
});
