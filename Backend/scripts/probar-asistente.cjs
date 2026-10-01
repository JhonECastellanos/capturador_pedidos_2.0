const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { ConfigService } = require('@nestjs/config');
const contrato = require('@ambie/contrato');
const { entenderBasico, validarIntencion, instruccionesAsistente, responderCampo } = require('../dist/asistente/intenciones');
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
test('HTTPS: IPv4 fijada mantiene el formato de lookup compatible con Node 24', async () => {
  const https = require('node:https'), dns = require('node:dns/promises');
  const { EventEmitter } = require('node:events');
  const originalRequest = https.request, originalLookup = dns.lookup;
  dns.lookup = async () => [{ address: '142.250.10.10', family: 4 }];
  https.request = (_url, opciones, responder) => {
    assert.equal(opciones.family, 4, 'Evita all:true y ERR_INVALID_IP_ADDRESS sin desactivar TLS ni controles SSRF');
    opciones.lookup('proveedor.invalid', { family: 4 }, (error, address, family) => { assert.equal(error, null); assert.equal(address, '142.250.10.10'); assert.equal(family, 4); });
    const req = new EventEmitter(); req.end = () => {
      const res = new EventEmitter(); res.statusCode = 200; responder(res);
      queueMicrotask(() => { res.emit('data', Buffer.from('{"models":[]}')); res.emit('end'); req.emit('close'); });
    }; return req;
  };
  try { assert.deepEqual(await require('../dist/asistente/red-proveedor').pedirProveedor('https://proveedor.invalid/models', {}), { models: [] }); }
  finally { https.request = originalRequest; dns.lookup = originalLookup; }
});
test('venta abierta: conversación secuencial y crédito bloqueado', async () => {
  const servicio = new AsistenteService({ leer: async () => contrato.ConfiguracionAsistenteEsquema.parse({}) });
  let orden = await servicio.entender('voy a tomar un pedido', 'vendedor', 'venta');
  orden = await servicio.entender('ocasional', 'vendedor', 'venta', orden, 'tipoCliente');
  assert.equal(orden.payload.clienteId, null);
  orden = await servicio.entender('una Coca-Cola 400 ml, dos Doritos queso, tres jugos de mango', 'vendedor', 'venta', orden, 'lineas');
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

test('productos: varias cantidades habladas, pausas, presentaciones y adiciones sin borrar', () => {
  assert.deepEqual(contrato.productosHablados('quiero 5 yogures de durazno y un de fresa').lineas, [{ productoId: 'yogures de durazno', cantidad: 5 }, { productoId: 'yogures de fresa', cantidad: 1 }]);
  assert.deepEqual(contrato.productosHablados('cinco yogurts de durazno, uno de fresa y dos de mora').lineas.map(l => l.cantidad), [5, 1, 2]);
  assert.equal(contrato.productosHablados('uno de fresa'), null, 'No inventa una familia sin contexto');
  for (const texto of ['dos Pepsi 400 ml y tres Doritos queso', 'dos Pepsi 400 ml tres Doritos queso', 'quiero dos Pepsi 400 ml, tres Doritos queso']) {
    assert.deepEqual(contrato.productosHablados(texto).lineas, [{ productoId: 'pepsi 400 ml', cantidad: 2 }, { productoId: 'doritos queso', cantidad: 3 }]);
  }
  assert.deepEqual(contrato.productosHablados('treinta y dos Pepsi 400 ml y veintidós papas natural').lineas.map(l => l.cantidad), [32, 22]);
  assert.deepEqual(contrato.productosHablados('dos Coca Cola cuatrocientos mililitros y seis Pepsi 1.5 L').lineas.map(l => l.productoId), ['coca cola cuatrocientos mililitros', 'pepsi 1.5 l']);
  for (const texto of ['dos', 'Pepsi', '-2 Pepsi', '1.5 Pepsi', 'cero Pepsi']) assert.equal(contrato.productosHablados(texto), null);
  const inicial = { accion: 'crear_pedido', payload: { clienteId: null, lineas: [{ productoId: 'pepsi', cantidad: 2 }] }, destino: null, mensaje: 'Revisar' };
  const agregado = responderCampo('tres Doritos queso', inicial, 'lineas', 'vendedor');
  assert.equal(agregado.payload.lineas.length, 2); assert.equal(agregado.payload.lineas[0].cantidad, 2);
  const sustituido = responderCampo('reemplaza un Pepsi 400 ml', agregado, 'lineas', 'vendedor');
  assert.deepEqual(responderCampo('reemplaza por un Pepsi 400 ml', agregado, 'lineas', 'vendedor').payload, sustituido.payload);
  assert.equal(sustituido.payload.lineas.length, 1); assert.equal(sustituido.payload.lineas[0].cantidad, 1);
});

async function moduloFrontend(nombre, globals = {}) {
  const ts = require('typescript');
  const codigo = await readFile(resolve(__dirname, '../../Frontend/src/modules/asistente', nombre), 'utf8');
  const salida = ts.transpileModule(codigo, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} };
  runInNewContext(salida, { module: modulo, exports: modulo.exports, require, ...globals });
  return modulo.exports;
}
test('productos: resuelve presentaciones inequívocas y rechaza variantes ambiguas', async () => {
  const { resolverProductoVoz } = await moduloFrontend('intencion.ts');
  const productos = require('../../scripts/fixtures/catalogo-demo.json').productos.map((p, i) => ({ id: String(i), nombre: p.nombre }));
  assert.equal(resolverProductoVoz('Coca cola cuatrocientos mililitros', productos), '0');
  assert.equal(resolverProductoVoz('Pepsi 400ml', productos), '2');
  assert.equal(resolverProductoVoz('Doritos queso', productos), '16');
  assert.throws(() => resolverProductoVoz('Coca Cola', productos), /varias presentaciones/);
  assert.throws(() => resolverProductoVoz('Doritos', productos), /varias presentaciones/);
  assert.throws(() => resolverProductoVoz('producto inexistente', productos), /No encontr/);
  const yogures = [{ id: 'durazno200', nombre: 'Yogur de durazno 200 ml' }, { id: 'fresa200', nombre: 'Yogur de fresa 200 ml' }, { id: 'fresa1000', nombre: 'Yogur de fresa 1 L' }];
  for (const nombre of ['yogures de durazno', 'yogurt durazno', 'yogur de durazmo', 'YOGURES DE DURAZNO 200ML']) assert.equal(resolverProductoVoz(nombre, yogures), 'durazno200');
  assert.throws(() => resolverProductoVoz('yogures de fresa', yogures), /varias presentaciones/);
  assert.throws(() => resolverProductoVoz('yogures', yogures), /varias presentaciones/);
  assert.throws(() => resolverProductoVoz('yogur de durazno 250 ml', yogures), /No encontr/, 'No corrige cifras de presentación');
  assert.throws(() => resolverProductoVoz('yogur de mora', yogures), /No encontr/, 'No sustituye sabores desconocidos');
  assert.equal(resolverProductoVoz('el de 200 ml', yogures.filter(p => p.id.startsWith('fresa'))), 'fresa200');
});
test('voz: confirma brevemente sin leer clientes, líneas ni identificadores', async () => {
  const { resumenIntencion, respuestaHablada } = await moduloFrontend('intencion.ts');
  const texto = resumenIntencion('crear_pedido', { clienteId: 'cliente-privado', lineas: [{ productoId: 'durazno', cantidad: 5 }, { productoId: 'fresa', cantidad: 1 }], metodo: 'efectivo' }, { inventario: [{ id: 'durazno', precioVenta: 3400 }, { id: 'fresa', precioVenta: 3300 }] });
  assert.equal(texto, 'Pedido listo. Total: 20.300 pesos.');
  assert.doesNotMatch(texto, /cliente|durazno|fresa|efectivo|cantidad/);
  assert.equal(respuestaHablada('Productos actualizados. Di confirmar productos para continuar.'), 'Listo.');
  assert.equal(respuestaHablada('Pedido confirmado. Total: 20.300 pesos.'), 'Pedido confirmado.');
  assert.equal(respuestaHablada(texto + ' Di confirmar operación para guardar.'), texto);
});
test('Gemini: consulta borrador sin modelo, pagina catálogo y no persiste la clave', async () => {
  const red = require('../dist/asistente/red-proveedor'); const original = red.pedirProveedor;
  let llamadas = 0, escrituras = 0;
  const servicio = new AsistenteService({ leer: async () => contrato.ConfiguracionAsistenteEsquema.parse({}), guardar: async () => { escrituras++; } });
  red.pedirProveedor = async (url, headers, cuerpo, consulta) => {
    llamadas++; assert.equal(headers['x-goog-api-key'], 'clave-ficticia');
    if (cuerpo) return { candidates: [{ content: { parts: [{ text: '{"disponible":true}' }] } }] };
    assert.equal(consulta.pageSize, '100');
    return consulta.pageToken ? { models: [{ name: 'models/gemini-prueba', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-prueba', supportedGenerationMethods: ['embedContent'] }] } : { models: [], nextPageToken: 'pagina-dos' };
  };
  try {
    assert.deepEqual(await servicio.modelos({ proveedor: 'gemini', clave: 'clave-ficticia' }), ['gemini-prueba']);
    assert.equal(llamadas, 2);
    assert.equal((await servicio.comprobarConexion({ proveedor: 'gemini', clave: 'clave-ficticia', modelo: 'gemini-prueba' })).disponible, true);
    assert.equal(escrituras, 0);
    await assert.rejects(() => servicio.modelos({ proveedor: 'gemini' }), /clave/);
    assert.equal(llamadas, 3, 'No llama sin clave ni activa proveedores automáticamente');
    for (const status of [400, 401, 403, 404, 429, 503]) assert.match(red.mensajeErrorProveedor(status), new RegExp(`HTTP ${status}`));
  } finally { red.pedirProveedor = original; }
});
test('Gemini: guardar conexión antes de seleccionar modelo y conservar clave', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'ambie-modelos-test-'));
  try {
    const config = new ConfiguracionAsistente(new ConfigService({ ASISTENTE_CONFIG_DIR: carpeta, ASISTENTE_CONFIG_SECRET: 'secreto-ficticio-para-pruebas-32-caracteres' }));
    assert.equal((await config.guardar({ proveedor: 'gemini', clave: 'clave-ficticia' })).modelo, '');
    assert.equal((await config.guardar({ proveedor: 'gemini', modelo: 'models/gemini-prueba' })).modelo, 'gemini-prueba');
    assert.equal((await config.publica()).tieneClave, true);
  } finally { await rm(carpeta, { recursive: true, force: true }); }
});
test('productos: matriz de expresiones naturales, plural, singular y contexto de sabor', async () => {
  const { resolverProductoVoz, ProductoVozAmbiguo } = await moduloFrontend('intencion.ts');
  const catalogo = [{ id: 'd', nombre: 'Yogur de durazno 200 ml' }, { id: 'f', nombre: 'Yogur de fresa 200 ml' }];
  let ejercicios = 0;
  for (const prefijo of ['', 'quiero ', 'necesito ', 'me das ', 'me puedes dar ', 'por favor dame ', 'ponme ', 'voy a llevar ', 'quiero llevar ', 'quiero que me des ']) {
    for (const frase of ['cinco yogures de durazno y uno de fresa', '5 yogurt durazno y 1 yogurt fresa', 'cinco yogurts de durazno y un fresa', '5 yogures de duraznos, un yogur de fresas']) {
      const lista = contrato.productosHablados(prefijo + frase);
      assert.ok(lista, prefijo + frase);
      assert.deepEqual(lista.lineas.map(l => ({ productoId: resolverProductoVoz(l.productoId, catalogo), cantidad: l.cantidad })), [{ productoId: 'd', cantidad: 5 }, { productoId: 'f', cantidad: 1 }], prefijo + frase);
      ejercicios++;
    }
  }
  assert.equal(ejercicios, 40);
  assert.throws(() => resolverProductoVoz('yogur durasno', [...catalogo, { id: 'd1', nombre: 'Yogur de durazno 1 L' }]), e => e instanceof ProductoVozAmbiguo && e.opciones.length === 2);
  assert.throws(() => resolverProductoVoz('yogur duras no', catalogo), e => e instanceof ProductoVozAmbiguo && /No encontré/.test(e.message));
  assert.equal(contrato.productosHablados('quiero yogures de durazno'), null, 'No inventa cantidad');
});
test('voz: espera 2200 ms, une palabras/frases y vuelve a esperar al oír parciales', async () => {
  let ahora = 0, id = 0; const timers = new Map(), recibidos = [];
  const { AgrupadorVoz, ESPERA_TURNO_VOZ_MS } = await moduloFrontend('agrupador-voz.ts', { setTimeout: (fn, ms) => { timers.set(++id, { fn, fecha: ahora + ms }); return id; }, clearTimeout: id => timers.delete(id) });
  const avanzar = ms => { ahora += ms; for (const [id, t] of timers) if (t.fecha <= ahora) { timers.delete(id); t.fn(); } };
  const voz = new AgrupadorVoz(e => recibidos.push(e));
  voz.recibir({ tipo: 'final', texto: 'dos', confianza: .99 }); avanzar(1000);
  voz.recibir({ tipo: 'final', texto: 'Pepsi 400 ml', confianza: .98 }); avanzar(1800);
  voz.recibir({ tipo: 'parcial', texto: 'y tres' }); avanzar(1800); assert.equal(recibidos.length, 0);
  voz.recibir({ tipo: 'final', texto: 'y tres Doritos queso', confianza: .97 }); avanzar(ESPERA_TURNO_VOZ_MS - 1); assert.equal(recibidos.length, 0);
  avanzar(1); assert.equal(recibidos.length, 1); assert.equal(recibidos[0].texto, 'dos Pepsi 400 ml y tres Doritos queso'); assert.equal(recibidos[0].confianza, .97);
  voz.recibir({ tipo: 'final', texto: 'confirmar operación', confianza: 1 }); voz.cancelar(); avanzar(3000); assert.equal(recibidos.length, 1);
  voz.recibir({ tipo: 'final', texto: 'otro', confianza: 1 }); voz.recibir({ tipo: 'error', mensaje: 'desconexión' }); avanzar(3000); assert.equal(recibidos.length, 2); assert.equal(recibidos[1].tipo, 'error');
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
