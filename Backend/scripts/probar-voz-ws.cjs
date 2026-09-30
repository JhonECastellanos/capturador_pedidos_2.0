const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { ConfigService } = require('@nestjs/config');
const { VozService } = require('../dist/asistente/voz.service');
const WebSocket = require('ws');
const { readFileSync } = require('node:fs');

async function main() {
  const http = createServer(); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  let revocada = false;
  const entorno = new ConfigService({ VOZ_STT_URL: process.env.VOZ_STT_URL || 'ws://localhost:2705', CORS_ALLOWED_ORIGIN: 'http://localhost:5181' });
  const prisma = { sesion: { findUnique: async () => ({ usuarioId: 'prueba', revocadoEn: revocada ? new Date() : null, expiraEn: new Date(Date.now() + 60000), usuario: { activo: true } }) } };
  const servicio = new VozService({ httpAdapter: { getHttpServer: () => http } }, entorno, prisma, { leer: async () => ({ vozHabilitada: true }) });
  servicio.onModuleInit();
  const ruta = `ws://127.0.0.1:${http.address().port}/api/v1/asistente/voz`;
  const conectar = (ticket, origin = 'http://localhost:5181') => new WebSocket(ruta, ['ambie-voz', ticket], { origin });
  const rechazar = (socket) => new Promise((resolve, reject) => { socket.on('open', () => { socket.close(); reject(new Error('Se aceptó una sesión inválida')); }); socket.on('error', resolve); });
  try {
    assert.equal(await servicio.disponible(), true);
    await rechazar(conectar('inexistente')); console.log('✓ Rechaza tickets inexistentes');
    const t1 = await servicio.ticket('prueba', 'sesion');
    await rechazar(conectar(t1.ticket, 'https://otro.example')); console.log('✓ Rechaza origen ajeno');
    await rechazar(conectar(t1.ticket)); console.log('✓ Ticket de un solo uso');
    servicio.intentos.clear();
    revocada = true; const t2 = await servicio.ticket('prueba', 'sesion'); await rechazar(conectar(t2.ticket)); revocada = false; console.log('✓ Rechaza sesión revocada');
    servicio.intentos.clear(); const t3 = await servicio.ticket('prueba', 'sesion'); const ws = conectar(t3.ticket);
    const resultado = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No llegó la transcripción')), 15000);
      ws.on('message', async (buffer) => {
        const evento = JSON.parse(buffer);
        if (evento.tipo === 'lista') {
          const wav = readFileSync(process.env.VOZ_PRUEBA_WAV || '.ambie-config/voz-prueba.wav'); let pos = 12, pcm;
          while (pos + 8 < wav.length) { const n = wav.readUInt32LE(pos + 4); if (wav.toString('ascii', pos, pos + 4) === 'data') pcm = wav.subarray(pos + 8, pos + 8 + n); pos += 8 + n + n % 2; }
          assert.ok(pcm); const audio = Buffer.concat([pcm, Buffer.alloc(64000)]);
          for (let i = 0; i < audio.length && ws.readyState === WebSocket.OPEN; i += 3200) { ws.send(audio.subarray(i, i + 3200)); await new Promise(r => setTimeout(r, 100)); }
        }
        if (evento.tipo === 'final' && evento.texto) { clearTimeout(timer); resolve(evento); }
      }); ws.on('error', reject);
    });
    const final = await resultado; assert.match(final.texto, /crear cliente maría pérez/); assert.ok(final.confianza >= .85);
    console.log('✓ PCM real atraviesa autenticación, WebSocket y Vosk:', final.texto);
    ws.close(); await once(ws, 'close');
  } finally { servicio.onModuleDestroy(); http.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
