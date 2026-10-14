/* Servicio de voz QA en localhost:7861; no realiza operaciones comerciales. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const token = fs.readFileSync('.local/audio-agentes-pruebas.env', 'utf8').trim().split('=')[1];
const base = 'http://127.0.0.1:7861';
async function llamada(ruta, datos, autorizada = true) {
  return fetch(base + ruta, { method: datos === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(autorizada ? { Authorization: `Bearer ${token}` } : {}) }, body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(15000) });
}
(async () => {
  assert.equal((await llamada('/salud')).status, 200);
  assert.equal((await llamada('/estado', {}, false)).status, 401);
  const estado = await llamada('/estado', {});
  assert.equal(estado.status, 200);
  const informacion = await estado.json();

  const preparado = informacion.modelosPreparados?.includes("tiny") === true;
  const sinModelo = await llamada('/transcribir', { stt: 'whisper', modelo: 'tiny', idioma: 'es', formato: 'audio/wav', audio: 'AA==' });
  if (informacion.ocupado && preparado) {
    assert.equal(sinModelo.status, 429);
    console.log('Audio QA: autorización comprobada y reconocimiento ocupado protegido con 429. Repetir WebSocket al terminar la preparación.');
    return;
  }
  assert.equal(sinModelo.status, preparado ? 400 : 409);
  const dato = Buffer.from(JSON.stringify({ id: randomUUID(), exp: Math.floor(Date.now() / 1000) + 30, stt: 'whisper', modelo: 'tiny', idioma: 'es' })).toString('base64url');
  const ticket = `${dato}.${createHmac('sha256', token).update(dato).digest('base64url')}`;
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:7861/conversar?ticket=${ticket}`);
    const limite = setTimeout(() => { socket.close(); reject(new Error('El audio no respondió')); }, 15000);
    socket.onmessage = evento => { try { const mensaje = JSON.parse(evento.data); assert.equal(mensaje.tipo, preparado ? 'listo' : 'error'); if (!preparado) assert.match(mensaje.mensaje, /Prepara primero/); clearTimeout(limite); socket.close(); resolve(); } catch (error) { clearTimeout(limite); socket.close(); reject(error); } };
    socket.onerror = () => { clearTimeout(limite); reject(new Error('Falló la conexión WebSocket QA')); };
  });
  console.log('Audio QA: salud, autorización, rechazo de audio inválido y conexión WebSocket comprobados según los modelos ya preparados. No se descargaron modelos.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
