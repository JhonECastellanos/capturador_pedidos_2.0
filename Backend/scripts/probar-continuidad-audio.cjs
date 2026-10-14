/* Audio sintético continuo en QA. No llama al modelo de interpretación ni guarda operaciones. */
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base='http://localhost:8180/api/v1';let token;
 async function api(ruta,method='GET',data){const r=await fetch(base+ruta,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(20000)});const j=await r.json();assert.ok(r.ok,`${ruta}: ${r.status} ${j.message||''}`);return j.data;}
 token=(await api('/auth/login','POST',{identifier:'system',password:process.env.SYSTEM_PASSWORD||process.env.BOOTSTRAP_PASSWORD})).accessToken;
 const fuente=process.env.AUDIO_PRUEBA_PCM;
 assert.ok(fuente&&fs.existsSync(fuente),'Indica AUDIO_PRUEBA_PCM con voz ficticia PCM16 mono/16 kHz');
 const pcm=fs.readFileSync(fuente);assert.ok(pcm.length>3200&&pcm.length<2000000);
 const conexiones=[];
 async function conectar(prolongada){
  const {ticket}=await api('/agentes/audio/sesion','POST',{});const inicio=performance.now();
  const ws=new WebSocket('ws://localhost:8180/api/v1/agentes/audio/conversar?ticket='+encodeURIComponent(ticket));
  let intervalo,temporizador,listo=false,cursor=0,enviados=0,escuchando=performance.now();
  return new Promise((resolve,reject)=>{
   let final=false;const terminar=(e,r)=>{if(final)return;final=true;clearInterval(intervalo);clearTimeout(temporizador);ws.close();if(e)reject(e);else resolve(r);};
   temporizador=setTimeout(()=>terminar(new Error('Se agotó el tiempo de continuidad QA')),prolongada?250000:45000);
   ws.onerror=()=>terminar(new Error('No conectó el audio QA'));
   ws.onclose=()=>{if(!final)terminar(new Error('El audio se cerró antes de completar la prueba'));};
   ws.onmessage=e=>{
    try { const m=JSON.parse(e.data);
    if(m.tipo==='error')terminar(new Error(m.mensaje));
    if(m.tipo==='listo'){
     listo=true;conexiones.push(Math.round(performance.now()-inicio));escuchando=performance.now();
     if(!prolongada){terminar(null,{listo:true});return;}
     intervalo=setInterval(()=>{if(ws.readyState!==WebSocket.OPEN)return;const pasados=performance.now()-escuchando;const bloque=pasados<205000?Buffer.alloc(3200):cursor<pcm.length?pcm.subarray(cursor,cursor+=3200):Buffer.alloc(3200);enviados+=bloque.length;ws.send(bloque);},100);
    }
    if(m.tipo==='instruccion'){
     const segundos=(performance.now()-escuchando)/1000;assert.ok(listo&&segundos>205);assert.ok(enviados>120*16000*2);
     assert.match(m.texto,/pedido/i);assert.ok(m.texto.length>50 && m.texto.length<=6000);
     terminar(null,{segundos:+segundos.toFixed(1),bytes:enviados,turnoReconocido:true});
    }
    } catch(error) { terminar(error); }
   };
  });
 }
 const continuidad=await conectar(true);await new Promise(r=>setTimeout(r,300));await conectar(false);
 console.log(JSON.stringify({conexionListaMs:conexiones,continuidad,operacionesGuardadas:0,proveedorInvocado:false}));
 await api('/auth/logout','POST',{});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
