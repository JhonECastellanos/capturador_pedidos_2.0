(() => {
  let periodo='anual';
  const {calcular,dinero}=OfertaAbinova;
  function actualizar(){
    document.documentElement.dataset.periodo=periodo;
    const promocion=OfertaAbinova.promocion();
    for(const b of document.querySelectorAll('button[data-periodo]'))b.setAttribute('aria-pressed',String(b.dataset.periodo===periodo));
    document.querySelector('button[data-periodo="anual"]').textContent=`Anual · ${OfertaAbinova.beneficioAnual()}`;
    document.querySelector('.sello-precios').textContent=periodo==='anual'?`Pago anual anticipado: ${OfertaAbinova.beneficioAnual()}`:'Mensual, con la opción de elegir el beneficio anual';
    document.querySelector('[data-resumen-promocion]').textContent=`Equivalente anual sobre ${promocion.mesesPagados} meses; pago único${promocion.mesesGratis?` y ${promocion.mesesGratis} meses extra`:''}. Tarifas base antes de impuestos.`;
    for(const plan of window.OFERTA_ABINOVA.planes){
      const t=[...document.querySelectorAll('.plan')].find(p=>p.dataset.nombre===plan.nombre),v=calcular(plan,periodo);if(!t)continue;
      t.querySelector('.pagar-plan').href=`compra.html?plan=${encodeURIComponent(plan.nombre)}&periodo=${periodo}`;
      let descripcion=t.querySelector('.descripcion-plan');
      if(!descripcion){descripcion=document.createElement('p');descripcion.className='descripcion-plan';t.querySelector('ul').before(descripcion);}
      descripcion.textContent=plan.descripcion;
      t.querySelector('ul').replaceChildren(...plan.beneficios.map(texto=>{const li=document.createElement('li');li.textContent=texto;return li;}));
      if(v.personalizado){t.querySelector('.detalle-precio').textContent=periodo==='anual'?OfertaAbinova.acuerdoAnual():'Proyecto personalizado. Alcance e importe por acordar.';continue;}
      t.dataset.precio=plan.precio;t.dataset.usuarios=plan.usuarios;t.dataset.agentes=plan.agentes;
      const contacto=t.querySelector('a.contacto');Object.assign(contacto.dataset,{precio:plan.precio,usuarios:plan.usuarios,agentes:plan.agentes});
      t.querySelector('.normal-plan s').textContent=`${dinero(plan.precio)}/mes`;
      t.querySelector('.cupos-plan').replaceChildren(...[`${plan.usuarios} usuarios`,`${plan.agentes} ${plan.agentes===1?'agente':'agentes'}`].map(texto=>{const span=document.createElement('span');span.textContent=texto;return span;}));
      t.querySelector('.creditos-plan').textContent=`${new Intl.NumberFormat('es-CO').format(plan.creditosMensuales)} créditos IA/mes sugeridos`;
      t.querySelector('.precio-plan strong').textContent=dinero(v.equivalente);
      t.querySelector('.precio-plan span').textContent=periodo==='anual'?'COP / mes equivalente':'COP / mes';
      t.querySelector('.descuento-plan').hidden=periodo!=='anual';t.querySelector('.normal-plan').hidden=periodo!=='anual';
      t.querySelector('.descuento-plan').textContent=`−${promocion.descuentoAnual} % anual`;
      t.querySelector('.detalle-precio').textContent=periodo==='anual'?`Pago único de ${dinero(v.total)} · ${v.meses} meses de servicio.`:'Pago mensual. Sin anticipo anual.';
    }
    window.dispatchEvent(new CustomEvent('abinova:periodo-comercial',{detail:periodo}));
  }
  for(const b of document.querySelectorAll('[data-periodo]'))b.addEventListener('click',()=>{periodo=b.dataset.periodo;actualizar();});
  window.addEventListener('abinova:oferta-actualizada',actualizar);
  actualizar();
})();
