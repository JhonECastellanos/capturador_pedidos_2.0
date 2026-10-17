// ABI comercial: orientación pública sobre la oferta; no accede a datos del negocio.
(() => {
  const contenedor=document.createElement('aside');contenedor.className='abi-flotante';contenedor.setAttribute('aria-label','ABI, tu guía de ABINOVA');
  contenedor.innerHTML='<span class="abi-saludo">Soy ABI. Habla conmigo aquí.</span><section class="abi-nube" hidden><p><b>ABI</b> · <span id="abi-estado">Toca para hablar</span></p><p class="abi-texto" id="abi-transcripcion" aria-live="polite">Te ayudo a elegir tu plan y conocer ABINOVA.</p><textarea rows="2" aria-label="Escribir a ABI" placeholder="También puedes escribir y pulsar Enter"></textarea><label>Ancho<input type="range" min="220" max="400" value="300" aria-label="Ancho de la nube de ABI"></label><a class="contacto" data-plan="Asesoría con ABI" href="https://wa.me/573125081070" target="_blank" rel="noopener">Hablar con una persona por WhatsApp ↗</a></section><button class="abi-boton" type="button" aria-label="Hablar con ABI" aria-pressed="false" data-estado="reposo" title="Un toque: micrófono. Dos toques: apagar. Arrastra para mover."><span class="abi-art"></span></button>';
  document.body.append(contenedor);
  const boton=contenedor.querySelector('button'),nube=contenedor.querySelector('.abi-nube'),transcripcion=contenedor.querySelector('#abi-transcripcion'),etiqueta=contenedor.querySelector('#abi-estado');
  fetch('assets/branding/abi.svg').then(r=>r.text()).then(svg=>{boton.querySelector('.abi-art').innerHTML=svg;}).catch(()=>{boton.textContent='ABI';});
  const Reconocimiento=window.SpeechRecognition||window.webkitSpeechRecognition;
  let reconocimiento,activo=false,silenciado=true,hablando=false,ultimoToque=0,ultimoTexto='',arrastre=null,movido=false,ultimoMovimiento=0,turno=0;
  function estado(valor){boton.dataset.estado=valor;etiqueta.textContent={reposo:'Toca para hablar',escuchando:'Te escucho',pensando:'Preparando respuesta',hablando:'Respondiendo'}[valor];boton.setAttribute('aria-pressed',String(activo&&!silenciado));}
  function decir(texto){
    transcripcion.textContent=texto;ultimoTexto=texto.toLowerCase();estado('hablando');hablando=true;
    if(!window.speechSynthesis){hablando=false;estado(activo&&!silenciado?'escuchando':'reposo');return;}
    speechSynthesis.cancel();const voz=new SpeechSynthesisUtterance(texto);voz.lang='es-CO';voz.rate=1.05;
    const fin=()=>{hablando=false;estado(activo&&!silenciado?'escuchando':'reposo');};voz.onend=fin;voz.onerror=fin;speechSynthesis.speak(voz);
  }
  function responderLocal(texto){
    const actual=++turno;estado('pensando');
    const q=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),oferta=window.OFERTA_ABINOVA;
    let respuesta;
    const plan=oferta.planes.find(p=>q.includes(p.nombre.toLowerCase()));
    if(/credito|tokens|consumo/.test(q))respuesta=plan&&plan.creditosMensuales?`${plan.nombre}: ${plan.creditosMensuales} créditos mensuales sugeridos. Base de mil tokens por crédito, ponderados por modelo, con reserva y conciliación. Requiere conexión asignada por el operador. API propia y modo local no consumen ese cupo.`:'La base es mil tokens por crédito, ponderados por modelo. Reservamos y conciliamos el consumo; no equivale a mensajes ni es ilimitado. API propia y modo local no consumen el cupo incluido.';
    else if(/local|hardware|sin internet/.test(q))respuesta='La instalación local es opcional. El modelo necesita hardware compatible y configuración. Lo validamos contigo; esta página no descarga modelos.';
    else if(plan){const v=OfertaAbinova.calcular(plan);respuesta=v.personalizado?`Empresarial se diseña a tu medida. ${OfertaAbinova.acuerdoAnual()} Armemos tu propuesta.`:`${plan.nombre} incluye ${plan.usuarios} usuarios y ${plan.agentes} agentes. ABI consulta, prepara y corrige; tú confirmas con tus permisos. Anual: ${OfertaAbinova.dinero(v.total)} por ${v.meses} meses.`;}
    else if(/hola|buen[oa]s|quien eres/.test(q))respuesta='Hola, soy ABI. Te ayudo a elegir tu plan de ABINOVA. ¿Cómo es tu negocio?';
    else if(/descuento|promocion|anual|gratis/.test(q))respuesta=`Al pagar ${OfertaAbinova.promocion().mesesPagados} meses por adelantado: ${OfertaAbinova.beneficioAnual()}. ${OfertaAbinova.notaPublica()}`;
    else if(/pago|tarjeta|comprar/.test(q))respuesta='Elige tu plan y toca Pagar con tarjeta para revisar la propuesta. La pasarela se conectará después; aún no hay cobros.';
    else if(/datos|seguridad|privacidad/.test(q))respuesta='ABI trabaja con permisos. La información de cada negocio se conserva en su propia instalación. Puedes leer las políticas al revisar tu plan.';
    else if(/agente|hacer|funcion|venta|inventario|caja|hora/.test(q))respuesta='ABI consulta, prepara ventas, corrige pedidos y ayuda con inventario y caja según tus permisos. Tú confirmas las operaciones. Los servicios se configuran para trabajar veinticuatro siete.';
    else respuesta='Cuéntame si buscas ventas, inventario o atención a clientes. También puedes decir Esencial, Negocios o Profesional para conocer tu plan.';
    queueMicrotask(()=>{if(actual===turno)decir(respuesta);});
  }
  const conversacionComercial=typeof crypto.randomUUID==='function'?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
  let peticionComercial;
  async function responder(texto){
    const actual=++turno;estado('pensando');
    peticionComercial?.abort();peticionComercial=new AbortController();
    try{
      const r=await fetch('/api/v1/comercial/asistente',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:texto.slice(0,1000),conversacion:conversacionComercial}),signal:AbortSignal.any([peticionComercial.signal,AbortSignal.timeout(40000)])});
      const cuerpo=await r.json();
      if(actual!==turno)return;
      if(r.ok&&typeof cuerpo.data?.respuesta==='string'){decir(cuerpo.data.respuesta);return;}
      if(r.status===409){responderLocal(texto);return;}
      decir(r.status===429?'Espera un momento o continúa por WhatsApp.':'No pude consultar al agente. Puedes revisar los planes o escribirnos por WhatsApp.');
    }catch{
      if(actual!==turno)return;
      decir('La conexión no está disponible. Puedes revisar los planes o continuar por WhatsApp.');
    }
  }
  function iniciar(){
    if(!Reconocimiento){transcripcion.textContent='Este navegador no ofrece dictado. Puedes escribir aquí o continuar por WhatsApp.';estado('reposo');return;}
    if(!reconocimiento){reconocimiento=new Reconocimiento();reconocimiento.lang='es-CO';reconocimiento.continuous=true;reconocimiento.interimResults=true;
      reconocimiento.onresult=e=>{const r=e.results[e.resultIndex],t=r[0].transcript.trim();if(hablando&&ultimoTexto.includes(t.toLowerCase()))return;transcripcion.textContent=t;if(r.isFinal){window.speechSynthesis?.cancel();hablando=false;responder(t);}};
      reconocimiento.onerror=e=>{if(['not-allowed','service-not-allowed','audio-capture'].includes(e.error)){silenciado=true;transcripcion.textContent='Revisa el permiso del micrófono. Puedes escribir tu pregunta.';estado('reposo');}};
      reconocimiento.onend=()=>{if(activo&&!silenciado)setTimeout(()=>{if(activo&&!silenciado)try{reconocimiento.start();}catch{}},300);};
    }
    try{reconocimiento.start();estado('escuchando');}catch{}
  }
  function apagar(){activo=false;silenciado=true;turno++;reconocimiento?.stop();window.speechSynthesis?.cancel();hablando=false;nube.hidden=true;estado('reposo');}
  boton.addEventListener('click',e=>{if(e.detail===0){movido=false;ultimoToque=0;}if(movido)return;const ahora=Date.now();if(ahora-ultimoToque<320){ultimoToque=0;apagar();return;}ultimoToque=ahora;nube.hidden=false;contenedor.querySelector('.abi-saludo').hidden=true;activo=true;silenciado=!silenciado;if(silenciado){reconocimiento?.stop();if(!hablando)estado('reposo');}else{window.speechSynthesis?.cancel();hablando=false;iniciar();}});
  contenedor.querySelector('textarea').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const t=e.currentTarget.value.trim();if(t){activo=true;responder(t);e.currentTarget.value='';}}});
  contenedor.querySelector('input').addEventListener('input',e=>{nube.style.width=`min(${e.target.value}px,calc(100vw - 24px))`;});
  function colocar(x,y){contenedor.style.left=Math.max(8,Math.min(innerWidth-78,x))+'px';contenedor.style.top=Math.max(8,Math.min(innerHeight-94,y))+'px';contenedor.style.right='auto';contenedor.style.bottom='auto';nube.style.right='auto';nube.style.left=x<innerWidth/2?'0':'auto';nube.style.right=x<innerWidth/2?'auto':'0';const saludo=contenedor.querySelector('.abi-saludo');saludo.style.left=x<innerWidth/2?'0':'auto';saludo.style.right=x<innerWidth/2?'auto':'0';nube.style.bottom=y<240?'auto':'100%';nube.style.top=y<240?'100%':'auto';}
  boton.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const r=contenedor.getBoundingClientRect();arrastre={x:e.clientX,y:e.clientY,izq:r.left,arriba:r.top};movido=false;boton.setPointerCapture(e.pointerId);});
  boton.addEventListener('pointermove',e=>{if(!arrastre)return;const dx=e.clientX-arrastre.x,dy=e.clientY-arrastre.y;if(Math.hypot(dx,dy)>7)movido=true;if(movido)colocar(arrastre.izq+dx,arrastre.arriba+dy);});
  boton.addEventListener('pointerup',()=>{arrastre=null;});boton.addEventListener('pointercancel',()=>{arrastre=null;movido=true;});
  document.addEventListener('pointerdown',e=>{if(!contenedor.contains(e.target))nube.hidden=true;},{passive:true});
  window.addEventListener('scroll',()=>{contenedor.querySelector('.abi-saludo').hidden=true;},{passive:true,once:true});
  const apartar=e=>{if(!nube.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||contenedor.contains(document.activeElement))return;if((e.type==='pointermove'&&e.pointerType!=='mouse')||arrastre||contenedor.contains(e.target)||Date.now()-ultimoMovimiento<1600)return;if(!e.target.closest?.('button,a,input,select,textarea,[role=button]'))return;const r=boton.getBoundingClientRect();if(Math.hypot(e.clientX-r.left-35,e.clientY-r.top-39)<95){ultimoMovimiento=Date.now();colocar(e.clientX>innerWidth/2?8:innerWidth-80,Math.min(innerHeight-96,Math.max(8,e.clientY+80)));}};document.addEventListener('pointermove',apartar,{passive:true});document.addEventListener('pointerdown',apartar,{passive:true});
  // Apartarse de controles enfocados sin robar foco ni cancelar Tab/click/touch.
  document.addEventListener('focusin',e=>{
    if(!nube.hidden||arrastre||contenedor.contains(e.target))return;
    const objetivo=e.target.closest?.('input,select,textarea,button,a,[contenteditable=true],[role=button]');if(!objetivo)return;
    const r=boton.getBoundingClientRect(),f=objetivo.getBoundingClientRect();
    const solapa=(x,y)=>x<f.right+12&&x+r.width>f.left-12&&y<f.bottom+12&&y+r.height>f.top-12;
    if(!solapa(r.left,r.top))return;
    const derecha=Math.max(8,innerWidth-r.width-8),abajo=Math.max(8,innerHeight-r.height-8);
    const destino=[[8,abajo],[derecha,abajo],[8,8],[derecha,8]].find(([x,y])=>!solapa(x,y));
    if(destino)colocar(...destino);
  });
  window.addEventListener('resize',()=>{const r=contenedor.getBoundingClientRect();colocar(r.left,r.top);});
  window.addEventListener('pagehide',apagar);setTimeout(()=>{contenedor.querySelector('.abi-saludo').hidden=true;},9000);
})();
