/* Una sola fórmula para tarjetas, resumen de compra y pruebas. Valores enteros COP. */
const OfertaAbinova = (() => {
  const dinero = n => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(n);
  // Respaldo inicial para apertura estática o consumidores sin catálogo remoto.
  const promocion = () => typeof window !== 'undefined' && window.OFERTA_ABINOVA?.promocion || {descuentoAnual:50,mesesPagados:12,mesesGratis:2,nota:''};
  const beneficioAnual = () => {
    const p=promocion();
    return [p.descuentoAnual ? `${p.descuentoAnual} % de descuento` : '',p.mesesGratis ? `${p.mesesGratis} meses gratis` : ''].filter(Boolean).join(' + ') || 'Sin descuento ni meses adicionales';
  };
  const acuerdoAnual = () => promocion().mesesGratis ? `Acuerdo anual: ${promocion().mesesGratis} meses adicionales sin costo.` : 'Acuerdo anual personalizado, sin meses adicionales.';
  // La nota editorial del respaldo no era texto público; solo publicar la nota del operador.
  const notaPublica = () => typeof document !== 'undefined' && document.documentElement.dataset.catalogo === 'api' ? promocion().nota : '';
  function condiciones() {
    const p=promocion();
    return `La modalidad anual de los planes con tarifa publicada aplica ${p.descuentoAnual} % de descuento sobre ${p.mesesPagados} mensualidades, mediante pago único anticipado. Recibes ${p.mesesPagados+p.mesesGratis} meses de servicio (${p.mesesPagados} contratados + ${p.mesesGratis} adicionales). El equivalente mensual se calcula sobre ${p.mesesPagados} meses; no es un cobro mensual. Empresarial requiere cotización. ${acuerdoAnual()}`;
  }
  function renderCondiciones() {
    if(typeof document==='undefined')return;
    for(const nodo of document.querySelectorAll('[data-condiciones-promocion]'))nodo.textContent=condiciones();
    for(const nodo of document.querySelectorAll('[data-nota-promocion]')){nodo.textContent=notaPublica();nodo.hidden=!notaPublica();}
  }
  function calcular(plan, periodo='anual') {
    if(typeof window!=='undefined')plan=window.OFERTA_ABINOVA?.planes.find(p=>p.nombre===plan.nombre)??plan;
    const p=promocion();
    if (!Number.isSafeInteger(plan.precio)) return { personalizado:true, mesesGratis:periodo==='anual'?p.mesesGratis:0 };
    const anual=periodo==='anual';
    const regular=plan.precio*(anual?p.mesesPagados:1);
    const total=anual?Math.round(regular*(100-p.descuentoAnual)/100):regular;
    return {personalizado:false,regular,total,ahorro:regular-total,equivalente:anual?total/p.mesesPagados:total,meses:anual?p.mesesPagados+p.mesesGratis:1,mesesGratis:anual?p.mesesGratis:0};
  }
  if(typeof window!=='undefined'){window.addEventListener('abinova:oferta-actualizada',renderCondiciones);renderCondiciones();}
  return {dinero,calcular,promocion,beneficioAnual,acuerdoAnual,notaPublica,condiciones,renderCondiciones};
})();
if(typeof module!=='undefined')module.exports=OfertaAbinova;
