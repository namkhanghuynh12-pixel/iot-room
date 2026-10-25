import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import mqtt from 'mqtt';
import http from 'node:http';
const root=fileURLToPath(new URL('..',import.meta.url));
const data=mkdtempSync(join(tmpdir(),'phong-iot-test-'));
const port=19765,mqttPort=19883,base=`http://localhost:${port}`;
let child;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){try{const p=await fn();if(p)return p;}catch{}await delay(100);}throw Error('Timed out');}
async function api(url,p){const r=await fetch(base+url,p===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}
function alternateHost(url,p){return new Promise((resolve,reject)=>{const req=http.request(base+url,{method:p?'POST':'GET',headers:{Host:'other.onrender.com','Content-Type':'application/json'}},res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});req.on('error',reject);req.end(p?JSON.stringify(p):undefined);});}
async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,IOT_DATA_DIR:data,IOT_HTTP_PORT:String(port),IOT_MQTT_PORT:String(mqttPort)},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.on('exit',c=>{if(c)console.error(errors);});await waitFor(()=>api('/api/health'));}
async function stop(){if(child?.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
test('MQTT, controls, two nodes, SQL persistence and access checks',{timeout:60000},async t=>{
  t.after(stop);await start();
  let s=await waitFor(async()=>{const p=await api('/api/status');return p.devices.filter(d=>d.online).length===2&&p;});assert.equal(s.device.id,'sim-room-01');
  await api('/api/simulator',{scenario:'custom',temperature:34,humidity:83,airQuality:90,light:10,motion:true});
  s=await waitFor(async()=>{const p=await api('/api/status');return p.device.fan&&!p.device.buzzer&&p.device.led&&p.device.acknowledged&&p;});assert.equal(s.device.alert,true);
  await api('/api/simulator',{scenario:'custom',temperature:26,humidity:60,airQuality:20,light:80,motion:false});
  await waitFor(async()=>{const p=await api('/api/status');return !p.device.fan&&!p.device.buzzer&&!p.device.led&&p.device.acknowledged;});
  await api('/api/settings',{mode:'manual',manualFan:true,manualBuzzer:true,led:true});
  s=await waitFor(async()=>{const p=await api('/api/status');return p.device.fan&&p.device.buzzer&&p.device.led&&p.device.acknowledged&&p;});
  await waitFor(async()=>{const p=await api('/api/status');return !p.device.buzzer&&p.device.buzzerLockout;},13000);
  assert.ok(s.devices.find(d=>d.id==='sim-room-02'));const rows=await api('/api/history');assert.ok(rows.length>=2);assert.equal(rows.at(-1).airQuality,null);
  let r=await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"onTemperature":0}'});assert.equal(r.status,400);
  r=await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.invalid'},body:'{}'});assert.equal(r.status,403);
  r=await fetch(base+'/api/export');assert.match(await r.text(),/temperature_c/);
  r=await fetch(base+'/manifest.webmanifest');assert.equal(r.status,200);
  r=await fetch(base+'/');assert.match(r.headers.get('content-security-policy'),/media-src 'self'/);
  const page=await r.text();assert.doesNotMatch(page,/<script(?![^>]*src=)|<style|\sstyle=|\sonclick=/i);
  r=await fetch(base+'/ui-state.js');assert.match(r.headers.get('content-type'),/javascript/);
  r=await fetch(base+'/bg.mp4',{headers:{Range:'bytes=0-31'}});
  assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,32);assert.match(r.headers.get('content-range'),/^bytes 0-31\//);
  r=await fetch(base+'/bg.mp4',{headers:{Range:'bytes=-16'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,16);
  r=await fetch(base+'/bg.mp4',{headers:{Range:'bytes=999999999-'}});assert.equal(r.status,416);
  r=await fetch(base+'/bg.mp4',{headers:{Range:'bytes=10-5'}});assert.equal(r.status,416);
  r=await fetch(base+'/poster.jpg');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/jpeg/);
  r=await fetch(base+'/api/firmware/status');assert.equal(r.status,200);assert.equal((await r.json()).supportedChip,'ESP32-C5');
  let alternate=await alternateHost('/api/firmware/status');assert.equal(alternate.body.available,false);
  alternate=await alternateHost('/api/firmware/flash',{port:'COM16',deviceId:'esp32-room-01'});assert.equal(alternate.status,403);
  r=await fetch(base+'/api/firmware/flash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:'COM9999',deviceId:'esp32-room-01'})});assert.equal(r.status,400);
  const secret=JSON.parse(readFileSync(join(data,'credentials.json')));
  const hw=await mqtt.connectAsync(`mqtt://127.0.0.1:${mqttPort}`,{clientId:'esp32-room-01',protocolVersion:4,username:'esp32',password:secret.hardware,reconnectPeriod:0});
  await api('/api/settings',{source:'hardware',mode:'auto'});
  await hw.publishAsync('iot/esp32-room-01/telemetry','broken json',{qos:1});assert.equal((await api('/api/health')).ok,true);
  await hw.subscribeAsync('iot/esp32-room-01/command',{qos:1});
  const received=new Promise(resolve=>hw.once('message',(_,p)=>resolve(JSON.parse(p.toString()))));
  await hw.publishAsync('iot/esp32-room-01/telemetry',JSON.stringify({temperature:32,humidity:65,airQuality:20,light:60,motion:true}),{qos:1});
  const cmd=await Promise.race([received,delay(5000).then(()=>{throw Error('No hardware command');})]);assert.equal(cmd.fan,true);
  await hw.publishAsync('iot/esp32-room-01/state',JSON.stringify({fan:true,buzzer:false,led:false,commandId:cmd.commandId}),{qos:1});
  await waitFor(async()=>(await api('/api/status')).device.acknowledged);await hw.endAsync();
  const bad=mqtt.connect(`mqtt://127.0.0.1:${mqttPort}`,{clientId:'esp32-room-02',protocolVersion:4,username:'esp32',password:'wrong',reconnectPeriod:0});
  const rejected=await new Promise(resolve=>{bad.on('connect',()=>resolve(false));bad.on('error',()=>resolve(true));});bad.end(true);assert.equal(rejected,true);
  await api('/api/settings',{source:'simulation',mode:'auto',onTemperature:33});const count=(await api('/api/history')).length;
  await stop();await start();assert.equal((await api('/api/status')).settings.onTemperature,33);assert.ok((await api('/api/history')).length>=count);
});
