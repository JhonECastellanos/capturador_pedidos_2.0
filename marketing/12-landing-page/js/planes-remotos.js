// Catálogo público: nunca se envían cookies, claves ni datos del negocio.
(() => {
  const nombres = ['Esencial','Negocios','Profesional','Empresarial'];
  const entero = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
  function valido(oferta) {
    const p=oferta?.promocion;
    if(p!==undefined && (!entero(p?.descuentoAnual) || p.descuentoAnual>80 || p.mesesPagados!==12 || !entero(p.mesesGratis) || p.mesesGratis>12 || typeof p.nota!=='string'))return false;
    return oferta && Array.isArray(oferta.planes) && oferta.planes.length === 4 &&
      nombres.every((nombre,i) => {
        const p = oferta.planes[i];
        return p?.nombre === nombre && (p.descripcion===undefined || typeof p.descripcion==='string') && (p.beneficios===undefined || Array.isArray(p.beneficios) && p.beneficios.every(b=>typeof b==='string')) && (i===3 ? p.precio===undefined && p.usuarios===undefined && p.agentes===undefined :
          entero(p.precio) && p.precio>0 && entero(p.usuarios) && p.usuarios>0 && entero(p.agentes) && p.agentes>0 && entero(p.creditosMensuales));
      });
  }
  window.CATALOGO_ABINOVA_LISTO = fetch('/api/v1/comercial/planes', {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(4000)})
    .then(async respuesta => {
      if(!respuesta.ok || respuesta.status===204) return;
      const cuerpo = await respuesta.json();
      // La API puede envolver la misma fuente comercial en {data}.
      const oferta = cuerpo.data ?? cuerpo;
      if(!valido(oferta)) return;
      const inicial=window.OFERTA_ABINOVA;
      window.OFERTA_ABINOVA = {...inicial,...oferta,promocion:oferta.promocion??inicial.promocion,planes:oferta.planes.map((p,i)=>({...inicial.planes[i],...p}))};
      document.documentElement.dataset.catalogo = 'api';
      window.dispatchEvent(new CustomEvent('abinova:oferta-actualizada'));
    }).catch(() => {/* Conserva el catálogo local si no hay servicio o red. */});
})();
