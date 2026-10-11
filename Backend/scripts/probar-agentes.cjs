/* Pruebas aisladas: proveedor simulado y catálogo en memoria, sin datos del negocio. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Prisma, RolUsuario } = require('@prisma/client');
const { InstruccionAgenteEsquema, problemaConexionAgente } = require('@ambie/contrato');
const { AgentesService, autorizarOperacion } = require('../dist/agentes/agentes.service');
const { probarProveedor, validarDestino, modelosProveedor, interpretarProveedor, permiteRespaldo } = require('../dist/agentes/proveedores');
const { PedidosService } = require('../dist/pedidos/pedidos.service');

const anteriorPruebas = process.env.AGENTES_PROVEEDORES_PRUEBA;
process.env.AGENTES_PROVEEDORES_PRUEBA = 'true';
let respuesta = { operacion: 'gasto', concepto: 'Transporte', monto: 1, metodo: 'efectivo' };
let codigo = 200;
let cuerpoProveedor;
let ultimaRuta;
let ultimoCuerpo;
const servidor = http.createServer((req, res) => {
  ultimaRuta = req.url;
  let entrada = '';
  req.on('data', parte => { entrada += parte; });
  req.on('end', () => {
  ultimoCuerpo = entrada ? JSON.parse(entrada) : undefined;
  res.writeHead(codigo, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpoProveedor ?? { choices: [{ message: { tool_calls: [{ function: { name: 'preparar_operacion', arguments: JSON.stringify(respuesta) } }] } }] }));
  });
});
const listo = new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
after(async () => { await new Promise(resolve => servidor.close(resolve)); if (anteriorPruebas === undefined) delete process.env.AGENTES_PROVEEDORES_PRUEBA; else process.env.AGENTES_PROVEEDORES_PRUEBA = anteriorPruebas; });
const productos = [
  { id: 'arepa', codigoInterno: 'PROD-0001', nombre: 'Arepa de queso', precioVenta: new Prisma.Decimal(4500), costoActual: new Prisma.Decimal(2000), stockFisico: 10, stockReservado: 1, activo: true, unidad: 'unidad' },
  { id: 'empanada', codigoInterno: 'PROD-0002', nombre: 'Empanada de pollo', precioVenta: new Prisma.Decimal(3500), costoActual: new Prisma.Decimal(1500), stockFisico: 10, stockReservado: 0, activo: true, unidad: 'unidad' },
  { id: 'cola', codigoInterno: 'PROD-0003', nombre: 'Coca-Cola pequeña', precioVenta: new Prisma.Decimal(3000), costoActual: new Prisma.Decimal(1800), stockFisico: 10, stockReservado: 0, activo: true, unidad: 'unidad' },
];
const servicio = new AgentesService({ producto: { findMany: async () => productos }, cliente: { findMany: async () => [] } });
const usuario = { id: 'vendedor', rol: RolUsuario.VENDEDOR };
const pedido = { operacion: 'pedido', ocasional: true, lineas: [{ producto: 'Arepa de queso', cantidad: 1 }, { producto: 'Empanada de pollo', cantidad: 1 }, { producto: 'Coca-Cola pequeña', cantidad: 2 }], metodo: 'efectivo', preparacion: 'pendiente' };

test('instrucción completa conserva tres productos y calcula el total del catálogo', async () => {
  const r = await servicio.revisar(pedido, usuario);
  assert.deepEqual(r.faltantes, []); assert.equal(r.total, '14000.00');
  assert.equal(r.datos.lineas.length, 3); assert.equal(r.ruta, '/vendedor/pedido');
});
test('corregir pago y cantidad mantiene el resto del pedido', async () => {
  const antes = await servicio.revisar(pedido, usuario);
  const r = await servicio.revisar({ ...pedido, metodo: 'billetera', lineas: pedido.lineas.map((l, i) => i === 2 ? { ...l, cantidad: 3 } : l) }, usuario, antes.id, 2);
  assert.equal(r.id, antes.id); assert.equal(r.version, 2); assert.equal(r.total, '17000.00');
  assert.equal(r.instruccion.preparacion, 'pendiente'); assert.equal(r.datos.metodo, 'billetera'); assert.notEqual(r.huella, antes.huella);
});
test('faltantes conservan líneas reconocidas sin completar el pago por intuición', async () => {
  const r = await servicio.revisar({ operacion: 'pedido', lineas: pedido.lineas }, usuario);
  assert.equal(r.datos.lineas.length, 3); assert.equal(r.faltantes.length, 3); assert.equal(r.datos.metodo, undefined);
});
test('producto desconocido y stock insuficiente impiden confirmar', async () => {
  const r = await servicio.revisar({ ...pedido, lineas: [{ producto: 'Producto inexistente', cantidad: 1 }, { producto: 'Arepa de queso', cantidad: 10 }] }, usuario);
  assert.equal(r.faltantes.length, 2); assert.match(r.faltantes.join(' '), /Solo hay 9/);
});
test('crédito ocasional no se permite y productos repetidos requieren aclaración', async () => {
  const r = await servicio.revisar({ ...pedido, metodo: 'credito', lineas: [pedido.lineas[0], pedido.lineas[0]] }, usuario);
  assert.equal(r.faltantes.length, 2);
});
test('permisos del agente respetan los roles del negocio', () => {
  assert.throws(() => autorizarOperacion(RolUsuario.VENDEDOR, 'precio'), e => e.getStatus() === 403);
  assert.throws(() => autorizarOperacion(RolUsuario.INVENTARIO, 'pedido'), e => e.getStatus() === 403);
  assert.doesNotThrow(() => autorizarOperacion(RolUsuario.INVENTARIO, 'conteo'));
});
test('contrato rechaza importes infinitos y campos ajenos a una instrucción', () => {
  assert.equal(InstruccionAgenteEsquema.safeParse({ operacion: 'gasto', monto: Infinity }).success, false);
  assert.equal(InstruccionAgenteEsquema.safeParse({ operacion: 'pedido', apiKey: 'dato-no-admitido' }).success, false);
});
test('destinos privados y URLs con credenciales se rechazan', async () => {
  await assert.rejects(validarDestino('https://192.168.1.10'));
  await assert.rejects(validarDestino('https://usuario:clave@example.com'));
  await assert.rejects(validarDestino('https://[::ffff:c0a8:101]'));
});
test('precio modificado después de revisar se rechaza antes de escribir el pedido', async () => {
  let escrituras = 0;
  const tx = { $queryRaw: async () => [], producto: { findMany: async () => [productos[0]] }, pedido: { create: async () => { escrituras++; } } };
  const pedidos = new PedidosService({ $transaction: async fn => fn(tx) });
  await assert.rejects(pedidos.crear({ metodo: 'efectivo', lineas: [{ productoId: 'arepa', cantidad: 1, precioEsperado: 4000 }] }, 'vendedor'), e => e.codigo === 'PRECIO_CAMBIO' && e.getStatus() === 409);
  assert.equal(escrituras, 0);
});
test('el indicador distingue respuesta válida, campos inválidos y cuota agotada', async () => {
  await listo;
  const p = { nombre: 'Proveedor de pruebas', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' };
  assert.equal((await probarProveedor(p)).estado, 'disponible');
  respuesta = { operacion: 'inventada' }; assert.equal((await probarProveedor(p)).estado, 'error');
  codigo = 429; assert.equal((await probarProveedor(p)).estado, 'limitado');
  codigo = 503; assert.equal((await probarProveedor(p)).estado, 'error');
});

test('captura del micrófono convierte un segundo a PCM de 16 kHz sin reproducirlo', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../Frontend/src/modules/agentes/captura-audio.js'), 'utf8');
  for (const frecuencia of [44100, 48000]) {
    const paquetes = [];
    let Captura;
    const contexto = { sampleRate: frecuencia, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: buffer => paquetes.push(buffer) }; } }, registerProcessor: (_nombre, clase) => { Captura = clase; } };
    vm.runInNewContext(codigo, contexto);
    const captura = new Captura();
    const entrada = new Float32Array(frecuencia).fill(0.25);
    for (let inicio = 0; inicio < frecuencia; inicio += 128) assert.equal(captura.process([[entrada.subarray(inicio, inicio + 128)]]), true);
    assert.equal(paquetes.length, 10);
    assert.equal(paquetes.reduce((suma, p) => suma + p.byteLength, 0), 32000);
    assert.equal(new Int16Array(paquetes[0])[0], 8192);
  }
});

test('configuración cifra claves, las conserva en edición y controla versiones', async () => {
  const { ConfiguracionAgenteInicial } = require('@ambie/contrato');
  const { randomUUID, randomBytes } = require('node:crypto');
  const anterior = process.env.AGENT_CONFIG_SECRET;
  process.env.AGENT_CONFIG_SECRET = randomBytes(32).toString('hex');
  let registro = null;
  const prisma = {
    configuracionAgente: { findUnique: async () => registro, upsert: async ({ create, update }) => { registro = registro ? { ...registro, ...update, version: registro.version + 1 } : { ...create, version: 1 }; } },
    $executeRaw: async () => 1,
    enTransaccion: async trabajo => trabajo(prisma),
  };
  const agente = new AgentesService(prisma);
  const clave = randomBytes(20).toString('hex');
  const id = randomUUID();
  const configuracion = { ...structuredClone(ConfiguracionAgenteInicial), proveedorId: id, proveedores: [{ id, nombre: 'Proveedor de pruebas', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba', apiKey: clave }] };
  try {
    const inicial = await agente.guardar(configuracion, 0);
    assert.equal(inicial.version, 1); assert.equal(inicial.proveedores[0].tieneClave, true);
    assert.equal(inicial.proveedores[0].apiKey, undefined);
    assert.equal(JSON.stringify(registro.configuracion).includes(clave), false);
    assert.equal(registro.secretos.includes(clave), false);
    delete configuracion.proveedores[0].apiKey;
    const segunda = await agente.guardar(configuracion, 1);
    assert.equal(segunda.proveedores[0].tieneClave, true);
    await assert.rejects(agente.guardar(configuracion, 1), error => error.codigo === 'CONFIGURACION_CAMBIO');
    configuracion.proveedores[0].borrarClave = true;
    const tercera = await agente.guardar(configuracion, 2);
    assert.equal(tercera.proveedores[0].tieneClave, false);
  } finally { if (anterior === undefined) delete process.env.AGENT_CONFIG_SECRET; else process.env.AGENT_CONFIG_SECRET = anterior; }
});
test('conteo usa el contexto abierto sin inventar cantidades y verifica la asignación', async () => {
  await listo; codigo = 200; respuesta = { operacion: 'conteo', cantidad: 0 };
  const conteoId = '7e604833-ef59-46cd-9c91-c1a98f157e43';
  let asignado = true;
  const contar = new AgentesService({
    conteoInventario: { findUnique: async () => ({ id: conteoId }) },
    conteoLinea: { findFirst: async ({ where }) => {
      assert.equal(where.asignadoPorId, 'colaborador');
      assert.equal(where.conteoId, conteoId);
      assert.ok(where.asignadoHasta.gt instanceof Date);
      return asignado ? { productoId: 'arepa', producto: productos[0], contadoEn: null, asignadoHasta: new Date(Date.now() + 300000) } : null;
    } },
  });
  contar.estado = async () => ({ habilitado: true });
  contar.proveedor = async () => ({ nombre: 'Prueba', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' });
  const colaborador = { id: 'colaborador', rol: RolUsuario.INVENTARIO };
  const contexto = { conteoId, producto: 'Arepa de queso' };
  const r = await contar.interpretar('Conté cero', undefined, colaborador, undefined, 1, contexto);
  assert.deepEqual(r.faltantes, []); assert.equal(r.datos.cantidad, 0); assert.equal(r.instruccion.conteoId, conteoId);
  respuesta = { operacion: 'conteo' };
  assert.match((await contar.interpretar('Contar', undefined, colaborador, undefined, 1, contexto)).faltantes.join(' '), /cantidad contada/);
  assert.match((await contar.interpretar('Contar', undefined, colaborador)).faltantes.join(' '), /Abre el conteo/);
  asignado = false; respuesta = { operacion: 'conteo', cantidad: 3 };
  assert.match((await contar.interpretar('Conté tres', undefined, colaborador, undefined, 1, contexto)).faltantes.join(' '), /producto asignado/);
  respuesta = { operacion: 'finalizar-conteo' };
  await assert.rejects(contar.interpretar('Finalizar', undefined, colaborador, undefined, 1, contexto), e => e.getStatus() === 403);
});

test('formato de conexión detecta protocolo Google incorrecto y rutas completas', () => {
  assert.match(problemaConexionAgente({ url: 'https://generativelanguage.googleapis.com/v1beta', protocolo: 'openai' }), /Google Gemini/);
  assert.equal(problemaConexionAgente({ url: 'https://generativelanguage.googleapis.com/v1beta', protocolo: 'gemini' }), null);
  assert.equal(problemaConexionAgente({ url: 'https://opencode.ai/zen/v1', protocolo: 'responses' }), null);
  assert.match(problemaConexionAgente({ url: 'https://opencode.ai/zen/v1/chat/completions', protocolo: 'openai' }), /quita la ruta/);
  assert.match(problemaConexionAgente({ url: 'https://opencode.ai/zen/v1?key=privada', protocolo: 'openai' }), /propio campo/);
  assert.match(problemaConexionAgente({ url: '', protocolo: 'openai' }), /completa/);
});
test('rechazo de clave se explica sin exponer el cuerpo privado del proveedor', async () => {
  await listo; codigo = 400;
  cuerpoProveedor = { error: { message: 'No debe mostrarse: secreto de prueba', details: [{ reason: 'API_KEY_INVALID' }] } };
  const p = { nombre: 'Prueba', protocolo: 'gemini', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' };
  try { await assert.rejects(modelosProveedor(p), e => e.getStatus() === 422 && e.codigo === 'PROVEEDOR_CREDENCIALES' && !e.message.includes('secreto de prueba')); }
  finally { codigo = 200; cuerpoProveedor = undefined; }
});
test('Responses utiliza su ruta y llamada estructurada sin conservar conversación remota', async () => {
  await listo; codigo = 200;
  cuerpoProveedor = { output: [{ type: 'function_call', name: 'preparar_operacion', arguments: JSON.stringify({ operacion: 'gasto', monto: 5, concepto: 'Prueba', metodo: 'efectivo' }) }] };
  const p = { nombre: 'Responses', protocolo: 'responses', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' };
  try {
    assert.equal((await interpretarProveedor(p, [{ role: 'user', content: 'Prepara un gasto' }])).monto, 5);
    assert.equal(ultimaRuta, '/responses'); assert.equal(ultimoCuerpo.store, false);
    assert.equal(ultimoCuerpo.tools[0].name, 'preparar_operacion');
  } finally { cuerpoProveedor = undefined; }
});

test('respaldo requiere autorización y se limita a fallos transitorios', async () => {
  const { ErrorDominio } = require('../dist/common/errores');
  assert.equal(permiteRespaldo(new ErrorDominio('PROVEEDOR_CREDENCIALES', 'Rechazada', 422)), false);
  assert.equal(permiteRespaldo(new ErrorDominio('MODELO_HERRAMIENTAS', 'Inválida', 502)), false);
  assert.equal(permiteRespaldo(new ErrorDominio('PROVEEDOR_LIMITE', 'Límite', 429)), true);
  const instancia = new AgentesService({});
  instancia.estado = async () => ({ habilitado: true });
  instancia.leer = async () => ({ configuracion: { modo: 'hibrido', respaldoId: null } });
  let consultas = 0;
  instancia.proveedor = async id => { consultas++; return { nombre: id ? 'Respaldo' : 'Principal', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: id ? 'respaldo' : 'principal' }; };
  instancia.revisar = async instruccion => ({ instruccion, faltantes: [] });
  codigo = 429;
  try {
    await assert.rejects(instancia.interpretar('Prueba', undefined, usuario), e => e.codigo === 'PROVEEDOR_LIMITE');
    assert.equal(consultas, 1);
    instancia.leer = async () => ({ configuracion: { modo: 'hibrido', respaldoId: 'autorizado' } });
    instancia.proveedor = async id => { consultas++; if (id) { codigo = 200; respuesta = { operacion: 'gasto', concepto: 'Prueba', monto: 1 }; } return { nombre: id ? 'Respaldo' : 'Principal', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: id ? 'respaldo' : 'principal' }; };
    const r = await instancia.interpretar('Prueba', undefined, usuario);
    assert.equal(r.conexion.respaldo, true); assert.equal(r.conexion.proveedor, 'Respaldo');
    assert.equal(consultas, 3);
  } finally { codigo = 200; }
});
test('límite de salida y métricas provienen de la solicitud y respuesta reales', async () => {
  await listo; codigo = 200;
  cuerpoProveedor = { choices: [{ message: { tool_calls: [{ function: { name: 'preparar_operacion', arguments: JSON.stringify({ operacion: 'gasto', concepto: 'Prueba', monto: 1 }) } }] } }], usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 } };
  let uso;
  try {
    await interpretarProveedor({ nombre: 'Prueba', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba', maxTokens: 256 }, [{ role: 'user', content: 'Prueba' }], dato => { uso = dato; });
    assert.equal(ultimoCuerpo.max_tokens, 256); assert.deepEqual(uso, { entrada: 40, salida: 12, total: 52 });
  } finally { cuerpoProveedor = undefined; }
});

 test('Gemini envía JSON Schema en parametersJsonSchema, sin parameters incompatibles', async () => {
  await listo; codigo = 200;
  cuerpoProveedor = { candidates: [{ content: { parts: [{ functionCall: { name: 'preparar_operacion', args: { operacion: 'gasto', monto: 1 } } }] } }] };
  try {
    await interpretarProveedor({ nombre: 'Google', protocolo: 'gemini', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' }, [{ role: 'user', content: 'Prueba' }]);
    const declaracion = ultimoCuerpo.tools[0].functionDeclarations[0];
    assert.equal(declaracion.parameters, undefined);
    assert.equal(declaracion.parametersJsonSchema.additionalProperties, false);
    assert.equal(declaracion.parametersJsonSchema.properties.lineas.items.additionalProperties, false);
  } finally { cuerpoProveedor = undefined; }
});

test('campos opcionales vacíos piden información, sin perder ceros ni líneas', () => {
  const { limpiarInstruccionProveedor } = require('../dist/agentes/proveedores');
  const dato = { operacion: 'conteo', cantidad: 0, descontarCaja: false, fecha: '', metodo: null, lineas: [{ producto: 'Prueba', cantidad: 0 }] };
  assert.deepEqual(limpiarInstruccionProveedor(dato), { operacion: 'conteo', cantidad: 0, descontarCaja: false, lineas: dato.lineas });
  assert.equal(InstruccionAgenteEsquema.safeParse(limpiarInstruccionProveedor({ operacion: '' })).success, false);
  assert.equal(InstruccionAgenteEsquema.safeParse(limpiarInstruccionProveedor({ operacion: 'gasto', apiKey: '' })).success, false);
  assert.equal(InstruccionAgenteEsquema.safeParse(limpiarInstruccionProveedor({ operacion: 'gasto', fecha: 'ayer' })).success, false);
});

test('indicador verde exige conservar el importe y el pago del ejercicio', async () => {
  await listo; codigo = 200;
  const anterior = respuesta;
  try {
    respuesta = { operacion: 'gasto', concepto: 'Prueba', monto: 1 };
    const r = await probarProveedor({ nombre: 'Prueba', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' });
    assert.equal(r.estado, 'error'); assert.match(r.mensaje, /importe y pago/);
  } finally { respuesta = anterior; }
});

test('gratuito requiere precios explícitos en cero, no valores ausentes o vacíos', () => {
  const { precioGratuito } = require('../dist/agentes/proveedores');
  assert.equal(precioGratuito({ prompt: '0', completion: '0' }), true);
  assert.equal(precioGratuito({ prompt: '0.000', completion: '0', request: '0' }), true);
  assert.equal(precioGratuito({ prompt: '0', completion: '0', request: '0.01' }), false);
  assert.equal(precioGratuito({ prompt: '', completion: '' }), false);
  assert.equal(precioGratuito({}), false);
  assert.equal(precioGratuito({ prompt: '0.01', completion: '0' }), false);
});

test('respuesta truncada explica el límite de salida sin inventar una operación', async () => {
  await listo; codigo = 200; cuerpoProveedor = { choices: [{ finish_reason: 'length', message: {} }] };
  try { await assert.rejects(interpretarProveedor({ nombre: 'Prueba', protocolo: 'openai', url: `http://127.0.0.1:${servidor.address().port}`, modelo: 'prueba' }, [{ role: 'user', content: 'Prueba' }]), e => e.codigo === 'MODELO_SALIDA_LIMITADA' && e.getStatus() === 422); }
  finally { cuerpoProveedor = undefined; }
});

test('micrófono muestra texto parcial sin interpretar y envía silencio durante el procesamiento', async () => {
  const ts = require('typescript'), vm = require('node:vm'), fs = require('node:fs');
  const fuente = fs.readFileSync('Frontend/src/modules/agentes/microfono.ts', 'utf8').replaceAll('import.meta.url', '"https://pruebas.invalid/captura.js"');
  const codigo = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let socket, capturador, pausado = false, paradas = 0, cierres = 0, interrupciones = 0;
  const parciales = [], finales = [], enviados = [];
  class Conexion {
    static OPEN = 1;
    constructor() { socket = this; this.readyState = 1; this.bufferedAmount = 0; queueMicrotask(() => this.onmessage({ data: JSON.stringify({ tipo: 'listo' }) })); }
    send(datos) { enviados.push(new Int16Array(datos)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  class Contexto {
    constructor() { this.audioWorklet = { addModule: async () => {} }; }
    async resume() {} async close() { cierres++; }
    createMediaStreamSource() { return { connect() {} }; }
  }
  class Capturador { constructor() { capturador = this; this.port = {}; } connect() {} disconnect() {} }
  const modulo = { exports: {} };
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: () => ({ api: async () => ({ ticket: 'ticket-ficticio' }), baseApi: '/api/v1' }), window: { isSecureContext: true, location: { href: 'https://pruebas.invalid/' }, speechSynthesis: { speaking: true, cancel: () => { interrupciones++; } } }, navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { paradas++; } }] }) } }, AudioContext: Contexto, AudioWorkletNode: Capturador, WebSocket: Conexion, URL, setTimeout, clearTimeout, ArrayBuffer });
  const detener = await modulo.exports.abrirMicrofono(v => finales.push(v), () => {}, () => {}, () => pausado, v => parciales.push(v));
  try {
    socket.onmessage({ data: JSON.stringify({ tipo: 'texto', texto: 'Dos arepas con queso' }) });
    assert.deepEqual(parciales, ['Dos arepas con queso']); assert.equal(finales.length, 0);
    socket.onmessage({ data: JSON.stringify({ tipo: 'instruccion', texto: 'Dos arepas con queso y un yogur' }) });
    assert.deepEqual(finales, ['Dos arepas con queso y un yogur']);
    socket.onmessage({ data: JSON.stringify({ tipo: 'hablando' }) }); assert.equal(interrupciones, 1);
    const pcm = new Int16Array([25, -40]);
    pausado = true; capturador.port.onmessage({ data: pcm.buffer }); assert.deepEqual([...enviados.at(-1)], [0, 0]);
    pausado = false; capturador.port.onmessage({ data: pcm.buffer }); assert.deepEqual([...enviados.at(-1)], [25, -40]);
  } finally { detener(); }
  detener(); assert.equal(paradas, 1); assert.equal(cierres, 1);
  socket.onmessage({ data: JSON.stringify({ tipo: 'instruccion', texto: 'No debe enviarse' }) }); assert.equal(finales.length, 1);
});


test('saludos y agradecimientos no se confunden con pedidos ni correcciones', () => {
  const ts = require('typescript'), vm = require('node:vm'), fs = require('node:fs');
  const fuente = fs.readFileSync('Frontend/src/modules/agentes/conversacion.ts', 'utf8');
  const codigo = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} }; vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports });
  const responder = modulo.exports.respuestaCordial;
  for (const texto of ['Hola buenas tardes', '¡Hola!', 'Buenos días', '¿Cómo estás?', 'Muchas gracias']) assert.ok(responder(texto));
  for (const texto of ['Hola, quiero cinco cafés', 'Buenas tardes, cambia el pago a billetera', 'Gracias, agrega dos aguas', 'Quiero un pan', 'confirmar']) assert.equal(responder(texto), null);
});

test('pedido ya entregado conserva el significado sin aplicar estado a otro pedido', () => {
  const { limpiarInstruccionProveedor } = require('../dist/agentes/proveedores');
  assert.equal(limpiarInstruccionProveedor({ operacion: 'pedido', estado: 'entregado' }).preparacion, 'entregado');
  assert.equal(limpiarInstruccionProveedor({ operacion: 'pedido', estado: 'entregado', preparacion: 'pendiente' }).preparacion, 'pendiente');
  assert.equal(limpiarInstruccionProveedor({ operacion: 'estado', estado: 'entregado' }).preparacion, undefined);
});


test('unidades dictadas en mililitros coinciden con ml sin inventar productos', async () => {
  const agua = { ...productos[0], id: 'agua', nombre: 'Agua Cristal 600 ml', codigoInterno: 'PROD-AGUA', precioVenta: new Prisma.Decimal(2500) };
  const prueba = new AgentesService({ producto: { findMany: async () => [agua] }, cliente: { findMany: async () => [] } });
  const r = await prueba.revisar({ operacion: 'pedido', ocasional: true, lineas: [{ producto: 'agua Cristal de 600 mililitros', cantidad: 3 }], metodo: 'efectivo', preparacion: 'pendiente' }, usuario);
  assert.deepEqual(r.faltantes, []); assert.equal(r.total, '7500.00'); assert.equal(r.datos.lineas[0].productoId, 'agua');
});


test('preparar una instrucción responde sin refrescar listas; los guardados sí invalidan', async () => {
  const ts = require('typescript'), vm = require('node:vm'), fs = require('node:fs');
  const fuente = fs.readFileSync('Frontend/src/data/api.ts', 'utf8').replaceAll('import.meta.env', '{}');
  const codigo = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let invalidaciones = 0;
  const consultas = { invalidateQueries: async () => { invalidaciones++; } };
  const modulo = { exports: {} }; vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: ruta => ruta === './query' ? { consultas, claveConsulta: ruta => ['api', 'sesion-ficticia', ruta] } : { claveGuardado: async () => undefined, resolverGuardado() {} }, fetch: async () => ({ ok: true, status: 201, json: async () => ({ data: { listo: true } }) }), AbortSignal, Date, DOMException });
  for (const ruta of ['/agentes/interpretar', '/agentes/revisar', '/agentes/audio/sesion', '/agentes/audio/transcribir']) assert.deepEqual(JSON.parse(JSON.stringify(await modulo.exports.api(ruta, 'POST', {}))), { listo: true });
  assert.equal(invalidaciones, 0);
  await modulo.exports.api('/pedidos', 'POST', {}); assert.equal(invalidaciones, 1);
  await modulo.exports.api('/agentes/configuracion', 'PUT', {}); assert.equal(invalidaciones, 2);
});


test('conversación conserva la sesión del proveedor sin reutilizar identificadores de operaciones', async () => {
  const modulo = require('../dist/agentes/proveedores'); const original = modulo.interpretarProveedor; const sesiones = [];
  modulo.interpretarProveedor = async p => { sesiones.push(p.sesion); return { operacion: 'gasto', concepto: 'Prueba', monto: 100, metodo: 'efectivo' }; };
  const prueba = new AgentesService({}); prueba.estado = async () => ({ habilitado: true }); prueba.proveedor = async () => ({ nombre: 'Prueba', modelo: 'modelo' });
  try {
    const primero = await prueba.interpretar('Gasto ficticio', undefined, { rol: RolUsuario.ADMINISTRADOR }, 'operacion-1', 1, undefined, 'sesion-conversacion');
    const segundo = await prueba.interpretar('Otro gasto ficticio', undefined, { rol: RolUsuario.ADMINISTRADOR }, 'operacion-2', 1, undefined, 'sesion-conversacion');
    assert.deepEqual(sesiones, ['sesion-conversacion', 'sesion-conversacion']); assert.notEqual(primero.id, segundo.id);
  } finally { modulo.interpretarProveedor = original; }
});
