import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const base=new URL('../../.local/workflows/',import.meta.url);
await mkdir(base,{recursive:true,mode:0o700});
await chmod(base,0o700);
// El directorio privado protege al host; los archivos individuales se montan
// solo en los servicios autorizados, que corren con UID sin privilegios.
async function conservar(nombre,contenido){const ruta=new URL(nombre,base);try{await writeFile(ruta,contenido,{flag:'wx',mode:0o644});}catch(e){if(e.code!=='EEXIST')throw e;}await chmod(ruta,0o644);}
for(const nombre of ['control.token','empresa.token','bridge.token'])await conservar(nombre,randomBytes(32).toString('hex'));
const token=(await readFile(new URL('empresa.token',base),'utf8')).trim();
const entorno=await readFile(new URL('../../.env',import.meta.url),'utf8').catch(()=>'');
const empresa=process.env.WORKFLOW_TENANT_ID||entorno.match(/^WORKFLOW_TENANT_ID=(.+)$/m)?.[1]?.trim()||'principal';
await conservar('registro.json',JSON.stringify([{id:empresa,nombre:'Mi empresa',url:'http://workflow-empresa:8090',token}],null,2));
await conservar('proveedor-incluido.json','{}\n');
await conservar('fuentes.json','[]\n');
console.log('Conexiones de workflows preparadas; secretos existentes conservados.');
