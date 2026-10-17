(function (root) {
  'use strict';
  const campos = ['gasto_medios','otros_costos','impresiones','alcance','clics_enlace','clientes_nuevos'];
  function calcular(entrada) {
    const errores = [];
    const d = {};
    for (const campo of campos) {
      const v = entrada[campo];
      if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0) errores.push('Revisa '+campo+': debe ser un número no negativo.');
      else d[campo] = Number(v);
    }
    for (const k of ['impresiones','alcance','clics_enlace','clientes_nuevos']) {
      if (d[k] !== undefined && !Number.isInteger(d[k])) errores.push(k+' requiere un conteo entero.');
    }
    if(d.alcance>d.impresiones)errores.push('En esta misma red y ventana, alcance no puede superar impresiones.');
    if(d.impresiones===0&&d.clics_enlace>0)errores.push('No calcular CTR con clics y ninguna impresión de esa misma pieza.');
    if(errores.length)return {errores,metricas:null};
    const total=d.gasto_medios+d.otros_costos;
    return {errores:[],datos:d,metricas:{cpm:d.impresiones?d.gasto_medios/d.impresiones*1000:null,frecuencia:d.alcance?d.impresiones/d.alcance:null,ctr:d.impresiones?d.clics_enlace/d.impresiones*100:null,cac:d.clientes_nuevos?total/d.clientes_nuevos:null,costo_total:total}};
  }
  const ejemplo = Object.freeze({gasto_medios:240000,otros_costos:60000,impresiones:30000,alcance:15000,clics_enlace:600,clientes_nuevos:12});
  const api={calcular,ejemplo,campos};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MetricasMarketing=api;
})(typeof globalThis==='undefined'?this:globalThis);
