const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const WebSocket = require('ws');
const { productosHablados, comandoVoz } = require('@ambie/contrato');
const base = 'http://localhost:3100/api/v1';
async function main() {
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'qa-admin@pruebas.invalid', password: 'SoloPruebas2026!' }) });
  assert.equal(login.status, 200); const token = (await login.json()).data.accessToken;
  try {
    const ejercicios = JSON.parse((await readFile('.local/pruebas-voz/ejercicios.json', 'utf8')).replace(/^\uFEFF/, ''));
    for (const ejercicio of ejercicios) {
      assert.match(ejercicio.archivo, /^ejercicio-\d+\.wav$/);
      const wav = await readFile('.local/pruebas-voz/' + ejercicio.archivo); let pcm;
      for (let p = 12; p + 8 < wav.length;) { const n = wav.readUInt32LE(p + 4); if (wav.toString('ascii', p, p + 4) === 'data') pcm = wav.subarray(p + 8, p + 8 + n); p += 8 + n + n % 2; }
      assert.ok(pcm);
      const ticket = await fetch(base + '/asistente/voz/sesion', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(ticket.status, 201);
      const ws = new WebSocket(base.replace('http:', 'ws:') + '/asistente/voz', ['ambie-voz', (await ticket.json()).data.ticket], { origin: 'http://localhost:3100' });
      const evento = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { ws.terminate(); reject(new Error('Transcripción agotada: ' + ejercicio.archivo)); }, 20000);
        ws.on('error', () => { clearTimeout(timer); reject(new Error('Falló la conexión de audio QA')); });
        ws.on('message', async buffer => {
          const e = JSON.parse(buffer.toString());
          if (e.tipo === 'error') { clearTimeout(timer); ws.close(); reject(new Error('Vosk rechazó el audio QA')); }
          if (e.tipo === 'final' && e.texto) { clearTimeout(timer); ws.close(); resolve(e); }
          if (e.tipo === 'lista') { const audio = Buffer.concat([pcm, Buffer.alloc(64000)]); for (let i = 0; i < audio.length && ws.readyState === WebSocket.OPEN; i += 3200) { ws.send(audio.subarray(i, i + 3200)); await new Promise(r => setTimeout(r, 100)); } }
        });
      });
      assert.ok(evento.confianza >= .65);
      const esperado = productosHablados(ejercicio.frase), recibido = productosHablados(evento.texto);
      if (esperado) { assert.ok(recibido, evento.texto); assert.deepEqual(recibido.lineas.map(l => l.cantidad), esperado.lineas.map(l => l.cantidad)); for (const sabor of ['durazno', 'fresa', 'pepsi']) if (ejercicio.frase.includes(sabor)) assert.ok(recibido.lineas.some(l => String(l.productoId).includes(sabor)), evento.texto); }
      else if (ejercicio.frase.startsWith('confirmar')) assert.equal(comandoVoz(evento.texto, evento.confianza), 'confirmar');
      else assert.equal(recibido, null, 'No inventar cantidades');
      console.log(`✓ audio→API→Vosk→cantidades/intención: ${evento.texto}`);
      await new Promise(r => setTimeout(r, 3200));
    }
  } finally { await fetch(base + '/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
