const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript'), vm = require('node:vm'), fs = require('node:fs');
function cargar(ruta, extras = {}) {
 const m={exports:{}};
 const codigo=ts.transpileModule(fs.readFileSync(ruta,'utf8').replaceAll('import.meta.url','"https://pruebas.invalid/captura.js"'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(codigo,{module:m,exports:m.exports,require:()=>({}),...extras});return m.exports;
}
const guiones=require('../../docs/ejemplos/confirmaciones-agente.json');
for(const frase of guiones.confirmaciones) test('confirmación natural: '+frase,()=>assert.equal(cargar('Frontend/src/modules/agentes/conversacion.ts').esConfirmacion(frase),true));
for(const frase of guiones.noConfirmar) test('no aceptar una negación o condición: '+frase,()=>assert.equal(cargar('Frontend/src/modules/agentes/conversacion.ts').esConfirmacion(frase),false));
test('reconectar conserva el micrófono y el silencio, sin repetir audio ni instrucciones',async()=>{
 let socket,captura,silenciar,paradas=0,tickets=0,fallar=false;const enviados=[],finales=[],diagnosticos=[];
 class WS{static OPEN=1;constructor(){socket=this;this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.onmessage({data:'{"tipo":"listo"}'}));}send(d){enviados.push([...new Int16Array(d)]);}close(){this.readyState=3;this.onclose?.({code:1012});}}
 class AC{constructor(){this.state='running';this.audioWorklet={addModule:async()=>{}};}async resume(){}async close(){}createMediaStreamSource(){return{connect(){}};}}
 class AW{constructor(){captura=this;this.port={};}connect(){}disconnect(){}}
 const m=cargar('Frontend/src/modules/agentes/microfono.ts',{performance,ArrayBuffer,URL,DOMException,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},window:{isSecureContext:true,location:{href:'https://pruebas.invalid/'},dispatchEvent:e=>diagnosticos.push(e.detail)},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>paradas++}],getAudioTracks:()=>[]})}},AudioContext:AC,AudioWorkletNode:AW,WebSocket:WS,require:()=>({baseApi:'/api/v1',api:async()=>{tickets++;if(fallar)throw new Error('Fuera de línea');return{ticket:'qa-'+tickets};}})});
 const detener=await m.abrirMicrofono(t=>finales.push(t),()=>{},(_d,s)=>silenciar=s);
 try{
 socket.onmessage({data:'null'});socket.onmessage({data:'{invalido'});
 socket.onmessage({data:'{"tipo":"instruccion","texto":"confirmar el pedido"}'});silenciar(true);
 const anterior=socket;anterior.close();captura.port.onmessage({data:new Int16Array([8]).buffer});assert.equal(enviados.length,0);
 await new Promise(r=>setTimeout(r,350));assert.notEqual(socket,anterior);assert.equal(tickets,2);assert.equal(paradas,0);
 anterior.onmessage({data:'{"tipo":"instruccion","texto":"no repetir"}'});assert.deepEqual(finales,['confirmar el pedido']);
 captura.port.onmessage({data:new Int16Array([8]).buffer});assert.deepEqual(enviados.at(-1),[0]);
 silenciar(false);captura.port.onmessage({data:new Int16Array([8]).buffer});assert.deepEqual(enviados.at(-1),[8]);
 assert.ok(diagnosticos.some(d=>d.fase==='conexion-cerrada'&&d.codigo===1012));
 fallar=true;socket.close();await new Promise(r=>setTimeout(r,2800));assert.equal(tickets,5,'Tres reintentos fallidos como máximo');assert.equal(paradas,1);assert.equal(silenciar(false),false);
 }finally{detener();}await new Promise(r=>setTimeout(r,300));assert.equal(tickets,5);assert.equal(paradas,1);
});
test('callback antiguo de TTS no silencia una respuesta nueva; falta de onend se recupera',()=>{
 const eventos=[],voces=[],temporizadores=[];
 const m=cargar('Frontend/src/modules/agentes/audio.ts',{Date,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},setTimeout:fn=>{temporizadores.push(fn);return temporizadores.length;},clearTimeout:()=>{},window:{dispatchEvent:e=>eventos.push(e.detail),speechSynthesis:{cancel(){},getVoices:()=>[],speak:m=>voces.push(m)}}});
 const audio={idioma:'es',velocidad:1,volumen:1,voz:''};m.hablar('Primera respuesta',audio);m.hablar('Segunda respuesta',audio);
 voces[1].onstart();voces[0].onend();assert.equal(eventos.at(-1),true);temporizadores.at(-1)();assert.equal(eventos.at(-1),false);
});
test('chat reutiliza las acciones y rechaza faltantes sin escribir',async()=>{
 const llamadas=[];const funciones=['registrarPedido','registrarRecepcion','registrarGasto','registrarEgresoCaja','registrarAbono','actualizarEstadoPedido','actualizarPrecioProducto','iniciarConteo','finalizarConteoActivo','aplicarAjusteDeConteo'];
 const o=Object.fromEntries(funciones.map(n=>[n,async(...args)=>{llamadas.push({n,args});return n==='registrarPedido'?{id:'pedido'}:true;}]));
 const m=cargar('Frontend/src/modules/agentes/guardar-chat.ts',{require:r=>r.includes('/api')?{api:async(...args)=>{llamadas.push({n:'api',args});}}:r.includes('servicios')?{construirPago:(metodo,total)=>({metodo,monto:total})}:{fechaLocalStr:()=> '2026-10-14'}});
 const base={faltantes:[],total:'200',datos:{lineas:[{productoId:'p',cantidad:2}],entrega:'pendiente',cliente:null,proveedorId:'proveedor',descontarCaja:false,clienteId:'cliente',pedidoId:'pedido',estado:'entregado',productoId:'p',contadoEnEsperado:'2026-10-14T00:00:00Z'}};
 for(const operacion of ['pedido','compra','gasto','egreso','cobro','estado','precio','iniciar-conteo','finalizar-conteo','aplicar-conteo','conteo','cierre'])assert.equal(await m.guardarDesdeChat({...base,instruccion:{operacion,metodo:'efectivo',concepto:'Prueba',monto:100,precio:200,conteoId:'conteo',tipoConteo:'general',cantidad:4,efectivo:100,billetera:0}},o,'usuario'),true,operacion);
 assert.equal(llamadas.length,12);assert.equal(llamadas[0].args[0].vendedorId,'usuario');assert.equal(llamadas[1].args[2],false);assert.equal(llamadas[10].args[2].contadoEnEsperado,'2026-10-14T00:00:00Z');
 assert.equal(await m.guardarDesdeChat({...base,faltantes:['Falta pago'],instruccion:{operacion:'pedido'}},o,'usuario'),false);assert.equal(llamadas.length,12);
});

test('una confirmación de compra no guarda un pedido preparado',()=>{const {esConfirmacion}=cargar('Frontend/src/modules/agentes/conversacion.ts');assert.equal(esConfirmacion('confirma la compra','pedido'),false);assert.equal(esConfirmacion('confirma la venta','pedido'),true);assert.equal(esConfirmacion('confirmar','compra'),true);});
