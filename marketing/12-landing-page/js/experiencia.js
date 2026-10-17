// Presentación y carrusel; los datos comerciales se conservan en sus módulos.
(() => {
  const lista = document.querySelector('#lista-planes');
  const tarjetas = [...lista.querySelectorAll('.plan')];
  const controles = document.querySelector('.navegacion-planes');
  const anterior = controles.querySelector('[data-plan-anterior]');
  const siguiente = controles.querySelector('[data-plan-siguiente]');
  const indicador = controles.querySelector('[role=status]');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  let indice = 0, pendiente = false;
  function actualizar() {
    const horizontal = lista.scrollWidth > lista.clientWidth + 2;
    controles.hidden = !horizontal;
    indice = tarjetas.reduce((mejor, tarjeta, i) => Math.abs(tarjeta.offsetLeft - lista.offsetLeft - lista.scrollLeft) < Math.abs(tarjetas[mejor].offsetLeft - lista.offsetLeft - lista.scrollLeft) ? i : mejor, 0);
    indicador.textContent = `${tarjetas[indice].dataset.nombre} · ${indice+1}/${tarjetas.length}`;
    anterior.disabled = indice === 0;
    siguiente.disabled = indice === tarjetas.length - 1;
  }
  function ir(i, enfocar=false) {
    const tarjeta = tarjetas[Math.max(0, Math.min(tarjetas.length-1,i))];
    lista.scrollTo({left: tarjeta.offsetLeft - lista.offsetLeft, behavior: reducido.matches ? 'instant' : 'smooth'});
    if(enfocar)tarjeta.focus({preventScroll:true});
  }
  anterior.addEventListener('click', () => ir(indice-1));
  siguiente.addEventListener('click', () => ir(indice+1));
  lista.addEventListener('keydown', e => {
    if (e.target !== lista && !e.target.classList.contains('plan')) return;
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key) || controles.hidden) return;
    e.preventDefault();
    ir(e.key==='Home'?0:e.key==='End'?tarjetas.length-1:indice+(e.key==='ArrowRight'?1:-1),true);
  });
  lista.addEventListener('scroll', () => {if(!pendiente){pendiente=true;requestAnimationFrame(()=>{pendiente=false;actualizar();});}}, {passive:true});
  window.addEventListener('resize', actualizar, {passive:true});
  actualizar();
  if (!reducido.matches && 'IntersectionObserver' in window) {
    const observador = new IntersectionObserver(entradas => {
      for(const entrada of entradas) if(entrada.isIntersecting){entrada.target.classList.remove('por-revelar');observador.unobserve(entrada.target);}
    }, {threshold:0,rootMargin:'0px 0px 24px 0px'});
    // Se anima el encabezado, no una sección larga ni una tarjeta fuera del carrusel.
    for(const nodo of document.querySelectorAll('.encabezado-seccion,.encabezado-planes,.hero-texto')) {
      nodo.dataset.revelar='';
      if(nodo.getBoundingClientRect().top>innerHeight){nodo.classList.add('por-revelar');observador.observe(nodo);}
    }
  }
})();

// Una ráfaga de rueda (incluida su inercia) solo puede cambiar una sección.
// Touch, Tab, enlaces y controles mantienen su comportamiento del navegador.
(() => {
  const horizontal = matchMedia('(min-width: 761px) and (orientation: landscape)');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const secciones = [...document.querySelectorAll('main > section')];
  if (!secciones.length) return;
  let gesto = null, ultimoEvento = 0, acumulado = 0, animacion = 0;
  const protegidos = 'input,textarea,select,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="listbox"],[role="combobox"],.abi-flotante';

  function cancelar() {
    cancelAnimationFrame(animacion);
    animacion = 0;
    gesto = null;
    acumulado = 0;
  }
  function independiente(destino, rueda = false) {
    if (document.querySelector('dialog[open],[aria-modal="true"]')) return true;
    const selector = rueda ? 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="listbox"],[role="combobox"],.abi-flotante' : protegidos;
    if (destino.closest(selector)) return true;
    for (let nodo = destino; nodo && nodo !== document.body; nodo = nodo.parentElement) {
      const estilo = getComputedStyle(nodo);
      if (/(auto|scroll)/.test(estilo.overflowY) && nodo.scrollHeight > nodo.clientHeight + 2) return true;
    }
    return false;
  }
  function actual() {
    // El hero incluye la cabecera en su primera pantalla.
    return secciones.findLastIndex(s => s.getBoundingClientRect().top <= 2);
  }
  function posicion(indice) {
    return indice <= 0 ? 0 : secciones[indice].getBoundingClientRect().top + scrollY;
  }
  function mover(y) {
    cancelAnimationFrame(animacion);
    const desde = scrollY;
    const hasta = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
    if (reducido.matches) { window.scrollTo({top:hasta, behavior:'instant'}); return; }
    const inicio = performance.now();
    function cuadro(ahora) {
      const t = Math.min(1, (ahora - inicio) / 520);
      window.scrollTo({top:desde + (hasta - desde) * (1 - Math.pow(1 - t, 3)), behavior:'instant'});
      animacion = t < 1 ? requestAnimationFrame(cuadro) : 0;
    }
    animacion = requestAnimationFrame(cuadro);
  }
  function limites(indice) {
    const seccion = secciones[indice];
    return {arriba:posicion(indice), abajo:Math.max(posicion(indice), seccion.getBoundingClientRect().bottom + scrollY - innerHeight)};
  }
  window.addEventListener('wheel', e => {
    const modal = document.querySelector('dialog[open],[aria-modal="true"]');
    if (horizontal.matches && modal) {
      cancelar();
      // Evita encadenar la rueda al fondo cuando el modal no tiene más recorrido.
      let desplazable = false;
      for (let nodo = e.target; nodo && modal.contains(nodo); nodo = nodo.parentElement) {
        const estilo = getComputedStyle(nodo);
        if (/(auto|scroll)/.test(estilo.overflowY) && (e.deltaY > 0 ? nodo.scrollTop + nodo.clientHeight < nodo.scrollHeight - 1 : nodo.scrollTop > 1)) desplazable = true;
      }
      if (!desplazable && !e.ctrlKey) e.preventDefault();
      return;
    }
    if (!horizontal.matches || e.defaultPrevented || e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY || independiente(e.target, true)) return;
    const indice = Math.max(0, actual());
    // Permite llegar al pie legal y volver desde él con scroll normal.
    if (scrollY > limites(secciones.length - 1).abajo + 2) return;
    const ahora = performance.now();
    if (!animacion && ahora - ultimoEvento > 220) { gesto = null; acumulado = 0; }
    ultimoEvento = ahora;
    e.preventDefault();
    if (animacion || gesto === 'salto') return;
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    const {arriba, abajo} = limites(indice);
    const direccion = Math.sign(delta);
    const puedeLeer = direccion > 0 ? scrollY < abajo - 2 : scrollY > arriba + 2;
    if (puedeLeer || gesto === 'lectura') {
      gesto = 'lectura';
      window.scrollTo({top:Math.max(arriba, Math.min(abajo, scrollY + delta)), behavior:'instant'});
      return;
    }
    acumulado += delta;
    if (Math.abs(acumulado) < 18) return;
    gesto = 'salto';
    const siguiente = indice + direccion;
    if (siguiente >= 0 && siguiente < secciones.length) {
      // Al volver a una sección larga se muestra primero su final.
      mover(direccion > 0 ? posicion(siguiente) : limites(siguiente).abajo);
    } else mover(direccion > 0 ? document.documentElement.scrollHeight : 0);
  }, {passive:false});

  window.addEventListener('keydown', e => {
    if (!horizontal.matches || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || independiente(e.target)) return;
    const direccion = ['PageDown','ArrowDown',' '].includes(e.key) ? (e.shiftKey ? -1 : 1) : ['PageUp','ArrowUp'].includes(e.key) ? -1 : 0;
    // Tab, Home y End siguen siendo nativos e interrumpen una transición.
    cancelar();
    if (!direccion) return;
    const indice = Math.max(0, actual()), {arriba, abajo} = limites(indice);
    if (scrollY > limites(secciones.length - 1).abajo + 2) return;
    e.preventDefault();
    if ((direccion > 0 && scrollY < abajo - 2) || (direccion < 0 && scrollY > arriba + 2)) {
      const paso = e.key.startsWith('Arrow') ? 40 : innerHeight * .85;
      mover(Math.max(arriba, Math.min(abajo, scrollY + direccion * paso)));
    } else {
      const siguiente = indice + direccion;
      mover(siguiente < 0 ? 0 : siguiente >= secciones.length ? document.documentElement.scrollHeight : direccion > 0 ? posicion(siguiente) : limites(siguiente).abajo);
    }
  });
  // Un resize, una interacción o un ancla no deben competir con la animación.
  window.addEventListener('resize', cancelar, {passive:true});
  window.addEventListener('pointerdown', cancelar, {passive:true});
  window.addEventListener('touchstart', cancelar, {passive:true});
  window.addEventListener('hashchange', cancelar);
  window.addEventListener('focusin', cancelar);
  horizontal.addEventListener('change', cancelar);
  reducido.addEventListener('change', cancelar);
})();
