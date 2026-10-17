// Fuente única de precios, cupos y beneficios. No publica ni modifica el aplicativo.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, '12-landing-page/index.html');
const oferta = JSON.parse(fs.readFileSync(path.join(root, 'datos/planes-propuestos.json'), 'utf8'));
const { calcular, dinero } = require('../12-landing-page/js/oferta.js');
const escape = texto => String(texto).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const attr = p => p.precio === undefined ? '' : ` data-precio="${p.precio}" data-usuarios="${p.usuarios}" data-agentes="${p.agentes}"`;
const tarjetas = oferta.planes.map(p => {
  const v = calcular(p, 'anual');
  return `<article class="plan${p.nombre === 'Negocios' ? ' destacado' : ''}" data-nombre="${p.nombre}"${attr(p)} aria-labelledby="plan-${p.nombre}" tabindex="0">
<span class="numero">${escape(p.publico)}</span><h3 id="plan-${p.nombre}">${p.nombre}</h3>
${v.personalizado ? '<div class="proyecto-plan">Proyecto personalizado</div><p class="detalle-precio">Acuerdo anual: dos meses adicionales sin costo.</p>' : `<div class="precio-plan"><strong>${dinero(v.equivalente)}</strong><span>COP / mes equivalente</span></div><p class="normal-plan">Normal: <s>${dinero(p.precio)}/mes</s> <span class="descuento-plan">−50 % anual</span></p><p class="detalle-precio">Pago único de ${dinero(v.total)} · 14 meses de servicio.</p><div class="cupos-plan"><span><b>${p.usuarios}</b> usuarios</span><span><b>${p.agentes}</b> ${p.agentes === 1 ? 'agente' : 'agentes'}</span></div>`}
<p class="creditos-plan">${v.personalizado ? 'Créditos y modelos según acuerdo.' : `${new Intl.NumberFormat('es-CO').format(p.creditosMensuales)} créditos IA/mes sugeridos`}</p><ul>${p.beneficios.map(b => `<li>${escape(b)}</li>`).join('')}</ul>
<div class="acciones-plan"><a class="boton ${p.nombre === 'Negocios' ? '' : 'secundario '}contacto" data-plan="${p.nombre}"${attr(p)} href="#contacto" aria-label="${p.cta || 'Consultar '+p.nombre+' por WhatsApp'}">${p.cta || 'Consultar por WhatsApp'} ↗</a><a class="boton pagar-plan" data-plan="${p.nombre}" href="compra.html?plan=${p.nombre}&amp;periodo=anual">${v.personalizado ? 'Preparar mi propuesta' : 'Pagar con tarjeta'} →</a></div></article>`;
}).join('\n');
const seccion = `<section class="seccion planes" id="planes" aria-labelledby="titulo-planes">
<div class="encabezado-planes"><div><p class="ceja">Tu equipo + ABI</p><h2 id="titulo-planes">Elige tu equipo con ABI.</h2><p>Consulta, prepara y corrige por chat o voz. Tú confirmas; ABI respeta tu rol.</p></div><a class="enlace contacto" href="#contacto" data-plan="Asesoría de planes">Te ayudamos a elegir ↗</a></div>
<div class="barra-planes"><p class="sello-precios">Pago anual anticipado: 50 % de descuento + 2 meses gratis</p><div class="periodos" role="group" aria-label="Forma de contratar"><button type="button" data-periodo="mensual" aria-pressed="false">Mensual</button><button type="button" data-periodo="anual" aria-pressed="true">Anual · 50 % menos</button></div></div>
<div class="rejilla-planes" id="lista-planes" role="region" aria-label="Planes disponibles">${tarjetas}</div>
<div class="navegacion-planes" role="group" aria-label="Navegar entre planes" hidden><button type="button" data-plan-anterior aria-label="Ver plan anterior" aria-controls="lista-planes">←</button><span role="status" aria-live="polite" id="posicion-plan">Esencial · 1/4</span><button type="button" data-plan-siguiente aria-label="Ver plan siguiente" aria-controls="lista-planes">→</button></div>
<div class="pie-planes"><p>¿Otra combinación de usuarios y agentes? <a class="contacto enlace" data-plan="Propuesta personalizada" href="#contacto">Armemos tu propuesta ↗</a></p><p>Equivalente anual sobre 12 meses; pago único y 2 meses extra. Tarifas base antes de impuestos. <a class="enlace" href="#uso-ia">Créditos, API propia e instalación local ↓</a> · Tarjeta en preparación.</p></div></section>`;
let html = fs.readFileSync(file, 'utf8');
if (!/<section class="seccion planes"/.test(html)) throw Error('Falta sección de planes');
html = html.replace(/<section class="seccion planes"[\s\S]*?<\/section>/, seccion);
fs.writeFileSync(file, html);
fs.writeFileSync(path.join(root, '12-landing-page/js/planes.js'), 'window.OFERTA_ABINOVA = ' + JSON.stringify(oferta) + ';\n');
console.log('Planes actualizados: precios y cupos desde la fuente única.');
