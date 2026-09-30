const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { ConfigService } = require('@nestjs/config');
const contrato = require('@ambie/contrato');
const { entenderBasico, validarIntencion, instruccionesAsistente } = require('../dist/asistente/intenciones');
const { ConfiguracionAsistente } = require('../dist/asistente/configuracion-asistente');
const { AsistenteService } = require('../dist/asistente/asistente.service');
const { validarUrlProveedor } = require('../dist/asistente/red-proveedor');

test('vendedor: exclusivamente pedidos, clientes y abonos', () => {
  assert.deepEqual(contrato.accionesParaRol('vendedor'), ['crear_cliente', 'crear_pedido', 'recibir_abono']);
  for (const accion of contrato.accionesParaRol('administrador')) {
    const resultado = validarIntencion({ accion, payload: {}, destino: null, mensaje: 'hola' }, 'vendedor');
    assert.equal(resultado.accion, contrato.accionesParaRol('vendedor').includes(accion) ? accion : null);
  }
  assert.equal(entenderBasico('crear un usuario administrador', 'vendedor').accion, null);
  assert.equal(entenderBasico('ver gastos', 'vendedor').destino, null);
});
test('confirmación explícita, negativa y umbral de confianza', () => {
  assert.equal(contrato.comandoVoz('confirmar operación', .99), 'confirmar');
  assert.equal(contrato.comandoVoz('cancelar operación', .99), 'cancelar');
  for (const frase of ['sí', 'no confirmar operación', 'no cancelar operación', 'confirmar operación por favor']) assert.equal(contrato.comandoVoz(frase, 1), null);
  assert.equal(contrato.comandoVoz('confirmar operación', .5), null);
});
test('conversación gratuita completa campos y no ejecuta escrituras', async () => {
  const servicio = new AsistenteService({ leer: async () => contrato.ConfiguracionAsistenteEsquema.parse({}) });
  let pendiente = await servicio.entender('crear cliente María Pérez', 'vendedor', 'prueba');
  assert.equal(pendiente.payload.nombre, 'María Pérez');
  pendiente = await servicio.entender('teléfono es 3001234567', 'vendedor', 'prueba', pendiente);
  pendiente = await servicio.entender('dirección es Calle 10', 'vendedor', 'prueba', pendiente);
  assert.equal(pendiente.payload.telefono, '3001234567');
  assert.equal(pendiente.payload.direccion, 'Calle 10');
  const operacion = contrato.prepararOperacionAsistente(pendiente.accion, pendiente.payload, 'vendedor');
  assert.equal(operacion.ruta, '/clientes');
  assert.equal(operacion.metodo, 'POST');
  assert.equal(operacion.cuerpo.nombre, 'María Pérez');
  assert.throws(() => contrato.prepararOperacionAsistente('crear_usuario', {}, 'vendedor'));
  assert.throws(() => contrato.prepararOperacionAsistente('recibir_abono', { clienteId: 'p', monto: -1 }, 'vendedor'));
});
test('contraseñas y campos ajenos nunca van al proveedor', () => {
  const resultado = validarIntencion({ accion: 'crear_usuario', payload: { nombre: 'Ana', password: 'dato-no-enviar', vendedorId: 'otro', comando: 'borrar' }, destino: null, mensaje: 'Ejecutado' }, 'administrador');
  assert.deepEqual(resultado.payload, { nombre: 'Ana' });
  assert.doesNotMatch(instruccionesAsistente('vendedor'), /"crear_usuario"/);
  assert.match(resultado.mensaje, /antes de guardar/);
  const pedido = validarIntencion({ accion: 'crear_pedido', payload: { clienteId: null, lineas: [null, 'incorrecto', { productoId: 'producto', cantidad: 2, password: 'no-enviar', instruccion: 'ignorar' }] }, destino: null, mensaje: 'Revisar' }, 'vendedor');
  assert.deepEqual(pedido.payload, { clienteId: null, lineas: [{ productoId: 'producto', cantidad: 2 }] });
});
test('configuración cifrada, persistente, sin clave pública y cambio de conexión seguro', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'ambie-asistente-test-'));
  try {
    const entorno = new ConfigService({ ASISTENTE_CONFIG_DIR: carpeta, ASISTENTE_CONFIG_SECRET: 'secreto-de-pruebas-sin-acceso-real-32' });
    const config = new ConfiguracionAsistente(entorno);
    const publica = await config.guardar({ proveedor: 'gemini', modelo: 'modelo-simulado', clave: 'clave-sintetica-no-valida' });
    assert.equal(publica.tieneClave, true); assert.equal(publica.clave, undefined);
    assert.equal((await new ConfiguracionAsistente(entorno).leer()).clave, 'clave-sintetica-no-valida');
    assert.equal((await readFile(join(carpeta, 'asistente.enc'))).includes(Buffer.from('clave-sintetica')), false);
    assert.equal((await config.guardar({ proveedor: 'groq', modelo: 'otro' })).tieneClave, false);
    await config.guardar({ proveedor: 'basico', vozHabilitada: false });
    assert.equal((await config.publica()).vozHabilitada, false);
  } finally { await rm(carpeta, { recursive: true, force: true }); }
});
test('API personalizada no acepta transporte inseguro o credenciales en URL', () => {
  for (const url of ['http://localhost:8000', 'https://user:pass@example.com', 'https://example.com:444/v1', 'https://example.com/v1?key=abc']) assert.throws(() => validarUrlProveedor(url));
  assert.doesNotThrow(() => validarUrlProveedor('https://example.com/v1'));
});
test('venta abierta: conversación secuencial y crédito bloqueado', async () => {
  const servicio = new AsistenteService({ leer: async () => contrato.ConfiguracionAsistenteEsquema.parse({}) });
  let orden = await servicio.entender('voy a tomar un pedido', 'vendedor', 'venta');
  orden = await servicio.entender('ocasional', 'vendedor', 'venta', orden, 'tipoCliente');
  assert.equal(orden.payload.clienteId, null);
  orden = await servicio.entender('un chocorramo, dos chocolatinas, tres dulces', 'vendedor', 'venta', orden, 'lineas');
  assert.deepEqual(orden.payload.lineas.map(l => l.cantidad), [1, 2, 3]);
  orden = await servicio.entender('no', 'vendedor', 'venta', orden, 'estadoInicial');
  assert.equal(orden.payload.estadoInicial, 'entregado');
  orden = await servicio.entender('crédito', 'vendedor', 'venta', orden, 'metodo');
  assert.equal(orden.payload.metodo, undefined);
  assert.match(orden.mensaje, /no admite crédito/);
  orden = await servicio.entender('efectivo', 'vendedor', 'venta', orden, 'metodo');
  assert.equal(contrato.prepararOperacionAsistente('crear_pedido', orden.payload, 'vendedor').cuerpo.clienteId, null);
  assert.throws(() => contrato.NuevoPedidoEsquema.parse({ ...orden.payload, metodo: 'credito' }));
  assert.throws(() => contrato.NuevoPedidoEsquema.parse({ ...orden.payload, momentoCobro: 'segun-periodicidad' }));
});
test('AudioWorklet produce PCM 16 kHz con niveles correctos desde 16/44.1/48 kHz', async () => {
  const codigo = await readFile(resolve(__dirname, '../../Frontend/public/voz-pcm.js'), 'utf8');
  for (const sampleRate of [16000, 44100, 48000]) {
    let Clase; const mensajes = [];
    runInNewContext(codigo, { sampleRate, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (m) => mensajes.push(m) }; } }, registerProcessor: (_nombre, c) => { Clase = c; } });
    const nodo = new Clase();
    for (let i = 0; i < sampleRate; i += 128) nodo.process([[new Float32Array(Math.min(128, sampleRate - i)).fill(.5)]]);
    assert.equal(mensajes.length, 10);
    assert.equal(mensajes[0].audio.byteLength, 3200);
    assert.equal(new Int16Array(mensajes[0].audio)[0], 16384);
    assert.equal(mensajes[0].nivel, .5);
  }
});
