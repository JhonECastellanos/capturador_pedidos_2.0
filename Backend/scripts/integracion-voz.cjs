const assert = require('node:assert/strict');
const WebSocket = require('ws');

// Solo fixtures del entorno aislado. Nunca usa micrófono ni proveedor remoto.
const base = process.env.BASE_PRUEBAS_API || 'http://localhost:3100/api/v1';
assert.ok(['http://localhost:3100/api/v1', 'http://localhost:8180/api/v1'].includes(base), 'Solo se permite la instancia QA');
async function http(ruta, token = '', metodo = 'GET', cuerpo) {
  const r = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  return { status: r.status, body: await r.json() };
}
async function login(rol) {
  const r = await http('/auth/login', '', 'POST', { identifier: `qa-${rol}@pruebas.invalid`, password: 'SoloPruebas2026!' });
  assert.equal(r.status, 200); return r.body.data.accessToken;
}
function conexion(ticket, origin = new URL(base).origin) {
  return new WebSocket(base.replace('http:', 'ws:') + '/asistente/voz', ['ambie-voz', ticket], { origin, handshakeTimeout: 5000 });
}
function rechazado(ticket, origin) {
  return new Promise((resolve, reject) => {
    const ws = conexion(ticket, origin);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('El rechazo WebSocket tardó demasiado')); }, 6000);
    ws.on('open', () => { clearTimeout(timer); ws.close(); reject(new Error('Se aceptó una conexión no autorizada')); });
    ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); const status = res.statusCode; res.resume(); ws.terminate(); resolve(status); });
    ws.on('error', () => {});
  });
}
async function audio(ticket) {
  await new Promise((resolve, reject) => {
    const ws = conexion(ticket);
    let lista = false;
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('No respondió el reconocimiento local')); }, 8000);
    ws.on('error', reject);
    ws.on('message', (buffer) => {
      const evento = JSON.parse(buffer.toString());
      if (evento.tipo === 'error') { clearTimeout(timer); ws.close(); reject(new Error(evento.mensaje)); }
      if (evento.tipo === 'lista') {
        lista = true;
        ws.send(Buffer.alloc(3200), { binary: true }); // 100 ms de silencio PCM16.
        ws.send('{"reset":1}');
        ws.send('mensaje-no-permitido');
      }
    });
    ws.on('close', (codigo) => { clearTimeout(timer); try { assert.equal(lista, true); assert.equal(codigo, 1008); resolve(); } catch (e) { reject(e); } });
  });
}
async function main() {
  const admin = await login('admin'), vendedor = await login('vendedor');
  assert.equal((await http('/asistente/voz/sesion', '', 'POST', {})).status, 401);
  assert.equal((await http('/asistente/configuracion', vendedor)).status, 403);
  assert.equal((await http('/asistente/configuracion', vendedor, 'PUT', {})).status, 403);
  const config = await http('/asistente/configuracion', admin);
  assert.equal(config.status, 200); assert.equal(config.body.data.proveedor, 'basico', 'No ejecutar pruebas con un proveedor remoto activo');
  assert.equal(config.body.data.clave, undefined);
  const cantidad = (await http('/clientes?pageSize=1', admin)).body.meta.total;
  const intencion = await http('/asistente/entender', vendedor, 'POST', { texto: 'crear cliente QA voz sin guardar' });
  assert.equal(intencion.status, 201); assert.equal(intencion.body.data.accion, 'crear_cliente');
  assert.equal((await http('/clientes?pageSize=1', admin)).body.meta.total, cantidad);
  const prohibida = await http('/asistente/entender', vendedor, 'POST', { texto: 'crear usuario administrador' });
  assert.equal(prohibida.body.data.accion, null);
  assert.equal((await http('/asistente/voz/estado', vendedor)).status, 403);
  assert.equal((await http('/asistente/voz/estado', admin)).body.data.disponible, true);
  console.log('✓ permisos, modo básico, configuración privada e intenciones sin escrituras');
  const ticket = await http('/asistente/voz/sesion', vendedor, 'POST', {});
  assert.equal(ticket.status, 201);
  await audio(ticket.body.data.ticket);
  assert.equal(await rechazado(ticket.body.data.ticket), 403);
  console.log('✓ conexión API→Vosk, audio sintético, mensajes inválidos y ticket de un solo uso');
  const otro = await http('/asistente/voz/sesion', admin, 'POST', {});
  assert.equal(otro.status, 201);
  assert.equal(await rechazado(otro.body.data.ticket, 'http://origen-no-autorizado.invalid'), 403);
  console.log('✓ rechazo de origen WebSocket no autorizado');
  await http('/auth/logout', admin, 'POST', {});
  await http('/auth/logout', vendedor, 'POST', {});
}
main().catch((e) => { console.error('✗', e.message); process.exitCode = 1; });
