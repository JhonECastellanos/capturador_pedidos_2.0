const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const args = ['compose', '-p', 'ambie-integracion', '-f', 'docker-compose.yml', '-f', 'docker-compose.pruebas.yml'];
const base = 'http://localhost:8180/api/v1';
let token = '';
async function pedir(ruta, metodo = 'GET', data) {
  const r = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const cuerpo = await r.json(); assert.ok(r.ok, `${metodo} ${ruta}: ${r.status}`); return cuerpo.data;
}
(async () => {
  token = (await pedir('/auth/login', 'POST', { identifier: 'system', password: process.env.SYSTEM_PASSWORD || process.env.BOOTSTRAP_PASSWORD })).accessToken;
  const anterior = await pedir('/dashboard/totales');
  await pedir('/dashboard/totales');
  try {
    execFileSync('docker.exe', [...args, 'stop', 'redis'], { stdio: 'inherit' });
    await pedir('/gastos', 'POST', { concepto: 'QA caída Redis', monto: 7 });
    const sinRedis = await pedir('/dashboard/totales');
    assert.equal(sinRedis.gastos, anterior.gastos + 7);
    assert.notEqual(sinRedis.cache.version, anterior.cache.version);
    assert.equal(sinRedis.cache.estado, 'miss');
  } finally { execFileSync('docker.exe', [...args, 'up', '-d', '--no-deps', '--wait', 'redis'], { stdio: 'inherit' }); }
  const recuperado = await pedir('/dashboard/totales');
  assert.equal(recuperado.gastos, anterior.gastos + 7);
  console.log('✓ Redis caído: lectura y escritura siguen funcionando; reconexión sin totales anteriores.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
