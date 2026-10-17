import {spawn} from 'node:child_process';
await import('./preparar.mjs');
const proceso=spawn(process.platform==='win32'?'docker.exe':'docker',['compose','--profile','workflows','up','-d','--build','--wait','--wait-timeout','240','workflow-control','workflow-empresa'],{stdio:'inherit'});
proceso.on('exit',codigo=>{process.exitCode=codigo??1});
