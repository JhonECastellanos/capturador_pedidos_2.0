'use strict';
(() => {
  const perfiles = window.PERFILES_ABINOVA || [];
  let elegido = perfiles[0];
  let perfilSeleccionado = false;
  const zona = document.querySelector('#detalle-perfil');
  const el = (tag, texto, clase) => { const n = document.createElement(tag); if (texto) n.textContent = texto; if (clase) n.className = clase; return n; };
  function actualizarContactos() {
    const modalidad = document.querySelector('#modalidad').value;
    const periodo = document.documentElement.dataset.periodo || "anual";
    for (const a of document.querySelectorAll('a.contacto')) {
      const plan = a.dataset.plan || 'Por definir';
      const ficha = window.OFERTA_ABINOVA?.planes.find(p=>p.nombre===plan); const valor = ficha && OfertaAbinova.calcular(ficha,periodo); const tarifa = valor?.personalizado ? " Proyecto personalizado a medida." : valor ? ` Modalidad ${periodo}: ${OfertaAbinova.dinero(valor.total)} COP, ${valor.meses} meses de servicio.` : "";
      const cupos = plan !== 'Empresarial' && a.dataset.usuarios ? ` ${a.dataset.usuarios} usuarios y ${a.dataset.agentes} ${a.dataset.agentes === '1' ? 'agente' : 'agentes'}.` : '';
      const mensaje = `Hola, quiero conocer ABINOVA y su chatbot operativo por chat y voz. Mi negocio: ${perfilSeleccionado ? elegido.nombre : 'por definir'}. Solución de interés: ${plan}.${tarifa}${cupos}${modalidad ? ` Modalidad: ${modalidad}.` : ''} Me gustaría recibir asesoría y acordar una demostración.`;
      a.href = 'https://wa.me/573125081070?text=' + encodeURIComponent(mensaje);
      a.target = '_blank'; a.rel = 'noopener noreferrer';
    }
  }
  function elegir(p, interactuado = false) {
    elegido = p;
    if (interactuado) perfilSeleccionado = true;
    for (const b of document.querySelectorAll('[data-perfil]')) { const activo = b.dataset.perfil === String(p.id); b.classList.toggle('activo', activo); b.setAttribute('aria-pressed', String(activo)); }
    const img = el('img'); img.src = `assets/personas/${String(p.id).padStart(2, '0')}.webp`; img.alt = `Escena ilustrativa: ${p.nombre}`; img.width = 800; img.height = 533; img.loading = 'lazy';
    const cuerpo = el('div'); cuerpo.append(el('p', p.nombre, 'ceja'), el('h3', p.dolor), el('p', p.beneficio));
    const funciones = el('div', '', 'funciones-perfil'); for (const f of p.funciones) funciones.append(el('span', f)); cuerpo.append(funciones, el('p', p.ejemplo, 'ejemplo'));
    cuerpo.append(el('p', 'Prueba también cómo el chatbot consulta, prepara, corrige y solicita confirmación de una operación de tu negocio.', 'micro'));
    const a = el('a', 'Quiero ver mi caso ↗', 'enlace contacto'); a.dataset.plan = 'Por definir'; cuerpo.append(a);
    cuerpo.append(el('p', 'Situación ilustrativa. El alcance y la adecuación a tu negocio se revisan en la demostración.', 'micro'));
    zona.replaceChildren(img, cuerpo); actualizarContactos();
    window.dispatchEvent(new CustomEvent('abinova-marketing', { detail: { evento: 'seleccion_perfil', perfil: p.id } }));
  }
  const selector = document.querySelector('#perfiles');
  for (const p of perfiles) { const b = el('button', p.nombre); b.type = 'button'; b.dataset.perfil = String(p.id); b.addEventListener('click', () => elegir(p, true)); selector.append(b); }
  if (elegido) elegir(elegido);
  document.querySelector('#modalidad').addEventListener('change', actualizarContactos);
  const pies = { chat: 'Chat: prepara y confirma dentro de la conversación.', ventas: 'Ventas: revisa el pedido antes de confirmar.', inventario: 'Inventario: consulta existencias y prepara tus conteos.', productos: 'Productos: consulta el catálogo y sus presentaciones.' };
  for (const b of document.querySelectorAll('[data-captura]')) b.addEventListener('click', () => {
    for (const otro of document.querySelectorAll('[data-captura]')) { const activo = otro === b; otro.classList.toggle('activo', activo); otro.setAttribute('aria-pressed', String(activo)); }
    const clave = b.dataset.captura; const img = document.querySelector('#captura-demo'); img.src = `assets/capturas/${clave}.png`; img.alt = `Captura auténtica de ${clave} de ABINOVA en QA`; document.querySelector('#pie-demo').textContent = pies[clave];
  });
  let temporizadores = [];
  const pasos = [...document.querySelectorAll('.paso-demo')];
  document.querySelector('#reproducir').addEventListener('click', () => {
    temporizadores.forEach(clearTimeout); temporizadores = [];
    const grupo = document.querySelector('#pasos-demo'); grupo.classList.add('reproduciendo'); pasos.forEach(p => p.classList.remove('visible'));
    pasos.forEach((p, i) => temporizadores.push(setTimeout(() => { p.classList.add('visible'); }, i * 1400)));
    temporizadores.push(setTimeout(() => grupo.classList.remove('reproduciendo'), 6000));
  });
  document.addEventListener('click', e => { const a = e.target.closest('a.contacto'); if (!a) return; window.dispatchEvent(new CustomEvent('abinova-marketing', { detail: { evento: 'clic_whatsapp', perfil: elegido?.id, plan: a.dataset.plan || 'Por definir', modalidad: document.querySelector('#modalidad').value } })); });
  window.addEventListener("abinova:periodo-comercial", actualizarContactos);
  actualizarContactos();
})();
