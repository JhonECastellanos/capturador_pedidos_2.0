// Catálogo reducido: 36 Facebook + 12 Instagram. No genera TikTok, MP4, slides ni A/B gráficos.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'recursos/exportaciones');
const perfiles=JSON.parse(fs.readFileSync(path.join(root,'datos/editorial.json'),'utf8')).perfiles;
const soloRenderizar=process.argv.includes('--solo-renderizar');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function lines(s,max){const arr=[];let line='';for(const w of s.split(/\s+/)){if((line+' '+w).trim().length>max&&line){arr.push(line);line=w;}else line=(line+' '+w).trim();}if(line)arr.push(line);return arr;}
function text(s,x,y,size,max,color='#fff',weight=500){return `<text x="${x}" y="${y}" fill="${color}" font-family="Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}">${lines(s,max).map((v,i)=>`<tspan x="${x}" dy="${i?size*1.2:0}">${esc(v)}</tspan>`).join('')}</text>`;}
function svg(p,i,a,red){
 const h=red==='facebook'?1080:1350,photoH=red==='facebook'?590:860;
 const logo=fs.readFileSync(path.join(root,'branding_logo_abi/logo.svg'),'utf8').replaceAll('#211d55','#ffffff').replace(/<svg[^>]*>/,'<svg x="50" y="'+(photoH+15)+'" width="245" height="56" viewBox="0 0 440 100">');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="'+h+'" viewBox="0 0 1080 '+h+'"><title>'+esc(p.nombre+' · ABINOVA')+'</title><desc>Oferta editorial con fotografía completa y logo estático. No se cubren rostros ni se muestran precios.</desc><rect width="1080" height="'+h+'" fill="#211d55"/><image x="0" y="0" width="1080" height="'+photoH+'" preserveAspectRatio="xMidYMid meet" href="../../recursos/originales/'+String(i+1).padStart(2,'0')+'.png"/>'+logo+text(red==='facebook'?a.titulo:p.nombre,50,photoH+115,37,46,'#fff',700)+text('50 % de descuento anual',50,h-205,56,60,'#d6ceff',700)+text('+ 2 meses gratis',50,h-150,32,65,'#8ce3ef',700)+text('Por tiempo limitado · Habla con ABI',50,h-93,27,70,'#fff',600)+text('Conoce planes y condiciones en nuestra landing',50,h-48,23,80,'#d6ceff')+text('En planes con tarifa publicada · Escena ilustrativa',50,h-17,16,90,'#c8c4e7')+'</svg>';
}
async function main(){
 if(process.argv.some(a=>['--videos','--solo-videos'].includes(a)))throw Error('Videos desactivados: usar STORYBOARD y PROMPTANIMACION por perfil.');
 fs.mkdirSync(out,{recursive:true});
 const esperados=new Set(perfiles.flatMap((p,i)=>[1,2,3].map(a=>`${String(i+1).padStart(2,'0')}-facebook-${a}`).concat(`${String(i+1).padStart(2,'0')}-instagram-portada`)).flatMap(id=>[id+'.png',id+'.svg']));
 const sobrantes=fs.readdirSync(out).filter(f=>!esperados.has(f));if(sobrantes.length)throw Error('Hay exportaciones ajenas al catálogo reducido; revisar antes de continuar: '+sobrantes.slice(0,3));
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 let browser;const recursos=[];
 try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 for(const [i,p] of perfiles.entries())for(const red of ['facebook','instagram'])for(const angulo of red==='facebook'?[1,2,3]:[0]){
 const id=`${String(i+1).padStart(2,'0')}-${red}-${angulo||'portada'}`,alto=red==='facebook'?1080:1350;const destino=`${String(i+1).padStart(2,'0')}-${p.slug}/${red}`;const salida=path.join(root,destino);fs.mkdirSync(salida,{recursive:true});
 // Permite actualizar PNG desde sus fuentes editadas sin regenerar foto, copy ni layout.
 if(!soloRenderizar)fs.writeFileSync(path.join(salida,id+'.svg'),svg(p,i,p.angulos[(angulo||1)-1],red));
 await page.setViewportSize({width:1080,height:alto});await page.goto(base+'/'+destino+'/'+id+'.svg');await page.evaluate(()=>document.fonts.ready);
 const loaded=await page.evaluate(()=>Promise.all([...document.querySelectorAll('image')].map(el=>new Promise((ok,no)=>{const img=new Image();img.onload=ok;img.onerror=no;img.src=el.href.baseVal;}))));
 await page.screenshot({path:path.join(salida,id+'.png')});
 recursos.push({id,perfil:i+1,red,angulo:angulo||null,angulos:red==='instagram'?[1,2,3]:[angulo],ancho:1080,alto,original:`recursos/originales/${String(i+1).padStart(2,'0')}.png`,exportaciones:[`${destino}/${id}.png`],editable:`${destino}/${id}.svg`,enfoques:'A/B solo textuales'});
 }
 if(!soloRenderizar){
 fs.writeFileSync(path.join(root,'14-produccion/manifiesto-recursos.json'),JSON.stringify({perfiles:12,facebook:36,instagram:12,imagenes:48,tiktok:'Solo storyboards/prompts con referencia original',recursos},null,2)+'\n');
 fs.writeFileSync(path.join(root,'14-produccion/manifiesto-videos.json'),JSON.stringify({videos:[],modo:'Storyboards y prompts por perfil/red/ángulo; renderizado MP4 desactivado'},null,2)+'\n');
 }
 console.log(soloRenderizar?'48 PNG renderizados desde SVG existentes; fuentes y manifiestos preservados.':'48 PNG y 48 SVG: 36 Facebook + 12 Instagram.');
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
