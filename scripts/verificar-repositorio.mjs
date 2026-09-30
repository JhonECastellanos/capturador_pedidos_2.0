import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const archivos = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean);
const problemas = [];
const secretosLocales = existsSync('.env') ? readFileSync('.env', 'utf8').split(/\r?\n/).flatMap(linea => {
  const m = linea.match(/^([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY)[A-Z0-9_]*)=(.*)$/);
  const valor = m?.[2].trim().replace(/^['"]|['"]$/g, '');
  return valor && valor.length >= 8 && !valor.startsWith('${') ? [valor] : [];
}) : [];
const patrones = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/, /\bAKIA[0-9A-Z]{16}\b/, /postgres(?:ql)?:\/\/(?:\$\{[^}]+\}|[^\s:/]+):([^\s@]+)@/g];
for (const archivo of archivos) {
  if (/(^|\/)(\.env(?:\..*)?|\.local|\.aws|\.ambie|node_modules|dist)(\/|$)/.test(archivo) && !archivo.endsWith('.env.example')) problemas.push(`${archivo}: archivo privado o generado`);
  if (/\.(dump|backup|pem|key|pfx|p12|sqlite|db)$/i.test(archivo)) problemas.push(`${archivo}: datos o credenciales`);
  let contenido; try { contenido = readFileSync(archivo, 'utf8'); } catch { continue; }
  if (secretosLocales.some(valor => contenido.includes(valor))) problemas.push(`${archivo}: coincide con un secreto local (valor oculto)`);
  for (const patron of patrones) {
    patron.lastIndex = 0;
    for (const coincidencia of contenido.matchAll(new RegExp(patron.source, 'g'))) {
      if (coincidencia[1] && /^(\$\{|<|\$[A-Z]|cambia|change|replace)/i.test(coincidencia[1])) continue;
      problemas.push(`${archivo}: posible secreto (valor oculto)`);
    }
  }
}
if (problemas.length) { console.error([...new Set(problemas)].join('\n')); process.exitCode = 1; }
else console.log(`✓ ${archivos.length} archivos versionados revisados; sin patrones sensibles detectados. Complementar con revisión del diff.`);
