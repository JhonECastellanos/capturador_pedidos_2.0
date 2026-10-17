// Migración local: conserva el texto existente y los bytes de PNG; no genera medios.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const write = (f, v) => fs.writeFileSync(path.join(root, f), JSON.stringify(v, null, 2) + '\n');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const perfiles = read('datos/personas.json');
const redes = ['facebook', 'instagram', 'tiktok'];
const remap = new Map();
const plan = [];
const registro = { alcance: 'Reorganización local; sin regenerar imágenes', textos: [], imagenes: [] };
for (const p of perfiles) {
  const dir = `${String(p.id).padStart(2, '0')}-${p.slug}`;
  for (const red of redes) for (const a of [1, 2, 3]) {
    const base = `${dir}/${red}/${String(a).padStart(2, '0')}-${p.slug}-a${a}`;
    for (const [suffix, tipo] of [['', 'copy'], ['-STORYBOARD', 'storyboard'], ['-PROMPTANIMACION', 'prompt']])
      remap.set(base + suffix + '.md', `${dir}/${red}/CONTENIDO.md#angulo-${a}-${tipo}`);
  }
}
function links(text, parent) {
  return text.replace(/\]\(([^)]+)\)/g, (all, href) => {
    if (/^(?:[a-z]+:|#)/i.test(href)) return all;
    const rel = path.posix.normalize(path.posix.join(parent, href.split('#')[0]));
    const target = remap.get(rel);
    if (!target) return all;
    const [file, anchor] = target.split('#');
    return '](' + (file === parent + '/CONTENIDO.md' ? '' : path.posix.relative(parent, file)) + '#' + anchor + ')';
  });
}
// Preparar todo antes de retirar archivos. Rechazar destinos o ediciones simultáneas.
for (const p of perfiles) {
  const dir = `${String(p.id).padStart(2, '0')}-${p.slug}`;
  for (const red of redes) {
    const parent = `${dir}/${red}`, dest = `${parent}/CONTENIDO.md`;
    if (fs.existsSync(path.join(root, dest))) throw Error('Ya consolidado; no repetir migración: ' + dest);
    const sources = [...remap.keys()].filter(f => f.startsWith(parent + '/'));
    const images = red === 'facebook' ? [1, 2, 3].map(a => `${String(p.id).padStart(2, '0')}-facebook-${a}.png`) : [red === 'instagram' ? `${String(p.id).padStart(2, '0')}-instagram-portada.png` : `${String(p.id).padStart(2, '0')}-referencia.png`];
    let content = `# ${p.nombre} · ${red}\n\nTres ángulos; copies A/B, guion narrado, storyboard y prompts de animación completos. Escenas ilustrativas, no testimonios ni videos grabados.\n\n## Imágenes sugeridas locales\n\n`;
    content += images.map((f, i) => `![${p.nombre} · ${red}${red === 'facebook' ? ' · ángulo ' + (i + 1) : ' · referencia compartida por los tres ángulos'}](${f})`).join('\n\n') + '\n\n';
    if (red === 'tiktok') content += 'Referencia sin recorte: copia exacta del PNG original. Adaptar al lienzo vertical manteniendo la foto completa y los subtítulos fuera de los rostros. No es un video final.\n\n';
    for (const f of sources) {
      const original = fs.readFileSync(path.join(root, f));
      const anchor = remap.get(f).split('#')[1];
      const text = links(original.toString('utf8'), parent);
      const block = `<a id="${anchor}"></a>\n\n<!-- Fuente consolidada: ${path.posix.basename(f)} -->\n\n${text.trim()}\n`;
      content += block + '\n---\n\n';
      registro.textos.push({ origen: f, destino: dest, ancla: anchor, sha256Original: sha(original), sha256TextoConsolidado: sha(text.trim()) });
      plan.push({ f, original });
    }
    plan.push({ dest, content });
  }
}
// Mover PNG/SVG del catálogo sin rasterizar; corregir solo href relativo del SVG.
const medios = read('14-produccion/manifiesto-recursos.json');
for (const r of medios.recursos) {
  const p = perfiles.find(p => p.id === r.perfil);
  const dir = `${String(p.id).padStart(2, '0')}-${p.slug}/${r.red}`;
  for (const key of ['exportaciones', 'editable']) {
    const list = Array.isArray(r[key]) ? r[key] : [r[key]];
    const updated = list.map(src => {
      const dest = dir + '/' + path.posix.basename(src);
      const bytes = fs.readFileSync(path.join(root, src));
      if (fs.existsSync(path.join(root, dest))) throw Error('Destino existente: ' + dest);
      plan.push({ move: src, dest, original: bytes, content: src.endsWith('.svg') ? bytes.toString('utf8').replaceAll('../originales/', '../../recursos/originales/') : bytes });
      registro.imagenes.push({ origen: src, destino: dest, sha256Original: sha(bytes), tipo: 'movido' });
      return dest;
    });
    r[key] = Array.isArray(r[key]) ? updated : updated[0];
  }
}
for (const p of perfiles) {
  const src = `recursos/originales/${String(p.id).padStart(2, '0')}.png`;
  const dest = `${String(p.id).padStart(2, '0')}-${p.slug}/tiktok/${String(p.id).padStart(2, '0')}-referencia.png`;
  if (fs.existsSync(path.join(root, dest))) throw Error('Destino existente: ' + dest);
  const bytes = fs.readFileSync(path.join(root, src));
  plan.push({ dest, content: bytes });
  registro.imagenes.push({ origen: src, destino: dest, sha256Original: sha(bytes), tipo: 'copia exacta' });
}
for (const item of plan) if (item.dest) fs.writeFileSync(path.join(root, item.dest), item.content);
for (const item of plan) {
  const src = item.f || item.move;
  if (!src) continue;
  const absolute = path.resolve(root, src);
  if (!absolute.startsWith(root + path.sep) || !/^(?:0[1-9]|1[012])-/.test(src) && !src.startsWith('recursos/exportaciones/')) throw Error('Fuera de alcance: ' + src);
  if (sha(fs.readFileSync(absolute)) !== sha(item.original)) throw Error('Edición simultánea preservada: ' + src);
  fs.unlinkSync(absolute);
}
const versiones = read('datos/versiones.json');
for (const v of versiones) for (const key of Object.keys(v.archivos)) v.archivos[key] = remap.get(v.archivos[key]) || v.archivos[key];
write('datos/versiones.json', versiones);
write('14-produccion/manifiesto-recursos.json', medios);
// Referencias existentes en índices, matriz y manifiesto, sin entrar a landing.
for (const p of perfiles) {
  const file = `${String(p.id).padStart(2, '0')}-${p.slug}/README.md`;
  const text = links(fs.readFileSync(path.join(root, file), 'utf8'), path.posix.dirname(file)).replace('en archivos separados', 'en un único CONTENIDO.md por red').replace('TikTok referencia la foto original', 'TikTok incluye una copia local exacta de la foto original');
  fs.writeFileSync(path.join(root, file), text);
}
const matrix = '13-metricas/matriz-contenidos.csv';
let csv = fs.readFileSync(path.join(root, matrix), 'utf8');
for (const [from, to] of remap) csv = csv.replaceAll(from, to);
fs.writeFileSync(path.join(root, matrix), csv);
const manifest = read('datos/manifiesto-editorial.json');
for (const f of remap.keys()) delete manifest.archivos[f];
for (const item of plan) if (item.dest?.endsWith('.md')) manifest.archivos[item.dest] = sha(fs.readFileSync(path.join(root, item.dest)));
for (const f of Object.keys(manifest.archivos)) if (fs.existsSync(path.join(root, f))) manifest.archivos[f] = sha(fs.readFileSync(path.join(root, f)));
manifest.estructura = 'un-md-por-red';
write('datos/manifiesto-editorial.json', manifest);
write('14-produccion/reorganizacion-redes.json', registro);
console.log('324 MD → 36 MD; 48 PNG y 48 SVG movidos; 12 referencias TikTok copiadas sin modificación.');
