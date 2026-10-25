import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root,'logs'),{recursive:true});
async function health(){try{return await (await fetch('http://localhost:8765/api/health',{signal:AbortSignal.timeout(1500)})).json();}catch{return null;}}
const action=process.argv[2]||'start';
if(action==='stop'){
  const p=await health();if(p?.app==='iot-room'){await fetch('http://localhost:8765/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});console.log('Da dung Phong IoT. Dau ra ESP32 se dung sau thoi han lenh.');}
}else{
  if(!(await health())){
    const out=fs.openSync(path.join(root,'logs','server.log'),'a');
    const err=fs.openSync(path.join(root,'logs','server-error.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});child.unref();
    for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));if(await health())break;}
  }
  if((await health())?.app!=='iot-room')throw Error('Khong khoi dong duoc; xem logs/server-error.log.');
  if(action==='gateway'){
    const out=fs.openSync(path.join(root,'logs','gateway.log'),'a'),err=fs.openSync(path.join(root,'logs','gateway-error.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'gateway-usb.mjs'),...process.argv.slice(3)],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});child.unref();
  }
  console.log('PHONG IOT: http://localhost:8765');
  if(process.platform==='win32') {
    try {
      spawn('cmd.exe',['/c','start','http://localhost:8765'],{detached:true,windowsHide:true,stdio:'ignore'}).unref();
    } catch {
      spawn('rundll32.exe',['url.dll,FileProtocolHandler','http://localhost:8765'],{detached:true,windowsHide:true,stdio:'ignore'}).unref();
    }
  }
}
