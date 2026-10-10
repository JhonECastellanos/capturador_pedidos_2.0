/* PostgreSQL QA exclusivamente: conserva la configuración previa y no toca operaciones. */
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ConfiguracionAgenteInicial } = require('@ambie/contrato');
const url = new URL('postgresql://127.0.0.1:5433/ambie_test?schema=public');
url.username = process.env.POSTGRES_USER || 'ambie';
url.password = process.env.POSTGRES_PASSWORD || '';
if (!url.password) throw new Error('Falta la contraseña privada de PostgreSQL QA');
process.env.DATABASE_URL = url.href;
process.env.AGENT_CONFIG_SECRET = randomBytes(32).toString('hex');
process.env.AGENTES_PROVEEDORES_PRUEBA = 'true';
const migracion = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'Backend/prisma/schema.prisma'], { env: process.env, stdio: 'inherit', timeout: 120000 });
if (migracion.status !== 0) throw new Error('No se aplicaron las migraciones de QA');
const { PrismaService } = require('../dist/common/prisma.module');
const { AgentesService } = require('../dist/agentes/agentes.service');
async function comprobar() {
  const prisma = new PrismaService();
  await prisma.$connect();
  let anterior;
  try {
    assert.equal((await prisma.$queryRaw`SELECT current_database() AS nombre`)[0].nombre, 'ambie_test');
    anterior = await prisma.configuracionAgente.findUnique({ where: { id: 'principal' } });
    if (anterior) throw new Error('QA ya tiene configuración del agente. Conservarla y utilizar una base QA limpia para este ejercicio');
    const antes = { pedidos: await prisma.pedido.count(), productos: await prisma.producto.count() };
    const clave = randomBytes(20).toString('hex');
    const id = randomUUID();
    const ajustes = { ...structuredClone(ConfiguracionAgenteInicial), proveedores: [{ id, nombre: 'Conexión QA', protocolo: 'openai', url: 'http://127.0.0.1:65530', modelo: 'modelo-de-prueba', apiKey: clave }], proveedorId: id };
    const servicio = new AgentesService(prisma);
    const inicio = Date.now();
    const guardado = await servicio.guardar(ajustes, 0);
    assert.equal(guardado.version, 1);
    const fila = await prisma.configuracionAgente.findUniqueOrThrow({ where: { id: 'principal' } });
    assert.equal(JSON.stringify(fila.configuracion).includes(clave), false);
    assert.equal(fila.secretos.includes(clave), false);
    await prisma.$disconnect();
    await prisma.$connect();
    const relectura = await new AgentesService(prisma).configuracion();
    assert.equal(relectura.proveedores[0].tieneClave, true);
    assert.equal(relectura.proveedores[0].modelo, 'modelo-de-prueba');
    await assert.rejects(servicio.guardar(ajustes, 0), e => e.codigo === 'CONFIGURACION_CAMBIO');
    assert.deepEqual({ pedidos: await prisma.pedido.count(), productos: await prisma.producto.count() }, antes);
    console.log(`Configuración confirmada y releída tras reconectar en ${Date.now() - inicio} ms; clave cifrada; versiones y documentos comerciales sin cambios.`);
  } finally {
    if (!anterior) await prisma.configuracionAgente.deleteMany({ where: { id: 'principal' } });
    await prisma.$disconnect();
  }
}
comprobar().catch(error => { console.error(error.message); process.exitCode = 1; });
