(() => {
  const params=new URLSearchParams(location.search);let plan=window.OFERTA_ABINOVA.planes.find(p=>p.nombre===params.get('plan'));
  const estado=document.querySelector('#estado-compra'),form=document.querySelector('#form-compra');
  if(!plan){document.querySelector('#plan-compra').textContent='Elige un plan para continuar';form.hidden=true;return;}
  const selector=document.querySelector('#periodo-compra');selector.value=params.get('periodo')==='mensual'?'mensual':'anual';
  document.querySelector('#plan-compra').textContent=plan.nombre;
  function render(){
    const v=OfertaAbinova.calcular(plan,selector.value),d=OfertaAbinova.dinero;
    const p=OfertaAbinova.promocion();
    selector.querySelector('[value="anual"]').textContent=`Anual · ${OfertaAbinova.beneficioAnual()}`;
    const lineas=v.personalizado?['Proyecto personalizado. Alcance e importe por acordar.',selector.value==='anual'?OfertaAbinova.acuerdoAnual():'Conversemos sobre tu proyecto.']:[`Normal: ${d(v.regular)} ${selector.value==='anual'?`por ${p.mesesPagados} meses`:'al mes'}.`,...(selector.value==='anual'?[`Descuento del ${p.descuentoAnual} %: ahorras ${d(v.ahorro)}.`,`Equivale a ${d(v.equivalente)} al mes sobre los ${p.mesesPagados} meses contratados.`]:[]),`Total ${selector.value==='anual'?'anual anticipado':'mensual'}: ${d(v.total)} COP.`,`Recibes ${v.meses} meses de servicio${v.mesesGratis?` (${p.mesesPagados} contratados + ${v.mesesGratis} gratis)`:''}.`,`${plan.usuarios} usuarios · ${plan.agentes} agentes.`];
    lineas.push(plan.descripcion,...plan.beneficios,OfertaAbinova.notaPublica());
    document.querySelector('#detalle-compra').replaceChildren(...lineas.map(t=>{const p=document.createElement('p');p.textContent=t;return p;}));
    const creditos=document.createElement('p');creditos.textContent=v.personalizado?'Créditos y modelos según acuerdo.':`${new Intl.NumberFormat('es-CO').format(plan.creditosMensuales)} créditos IA/mes sugeridos. Base de 1.000 tokens por crédito, ponderados por modelo; reserva y conciliación del consumo. Requiere conexión asignada por el operador. API propia o modelo local no consumen el cupo incluido.`;document.querySelector('#detalle-compra').append(creditos);
    const mensaje=`Hola, quiero contratar ABINOVA, plan ${plan.nombre}, modalidad ${selector.value}. ${v.personalizado?'Quiero acordar el proyecto y sus condiciones.':`Total de referencia ${d(v.total)} COP; ${v.meses} meses de servicio.`} Revisemos las condiciones antes de pagar.`;
    document.querySelector('#consulta-compra').href='https://wa.me/573125081070?text='+encodeURIComponent(mensaje);
    form.querySelector('button').textContent=v.personalizado?'Continuar con mi propuesta →':'Continuar con tarjeta →';estado.textContent='';
  }
  selector.addEventListener('change',render);
  window.addEventListener('abinova:oferta-actualizada',()=>{plan=window.OFERTA_ABINOVA.planes.find(p=>p.nombre===params.get('plan'));render();});
  form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;estado.textContent='Tu selección está lista. El pago con tarjeta se habilitará al conectar la pasarela. Puedes consultar esta propuesta por WhatsApp.';});
  render();
})();
