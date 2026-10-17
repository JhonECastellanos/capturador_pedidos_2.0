const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const personas = JSON.parse(fs.readFileSync(path.join(raiz, 'datos/personas.json'), 'utf8'));
if (!Array.isArray(personas) || personas.length !== 12) throw Error('Se esperan doce perfiles completos');
const publicos = personas.map(({ id, nombre, dolor, beneficio, funciones, ejemplo }) => ({ id, nombre, dolor, beneficio, funciones: funciones.slice(0, 4), ejemplo }));
fs.writeFileSync(path.join(raiz, '12-landing-page/js/datos.js'), '// Solo datos comerciales públicos. Sin investigación interna, tarifas ni datos del negocio.\nwindow.PERFILES_ABINOVA = ' + JSON.stringify(publicos, null, 2) + ';\n');
console.log('Doce perfiles integrados en la landing.');
