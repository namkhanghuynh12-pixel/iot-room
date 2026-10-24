import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import mqtt from 'mqtt';
const root=path.dirname(fileURLToPath(import.meta.url)),tools=path.join(root,'tools/mosquitto'),dir=path.join(root,'data/mosquitto-test');
fs.mkdirSync(dir,{recursive:true});
const password=randomBytes(16).toString('hex'),passwd=path.join(dir,'passwd'),conf=path.join(dir,'mosquitto.conf');
execFileSync(path.join(tools,'mosquitto_passwd.exe'),['-b','-c',passwd,'lab',password],{windowsHide:true});
fs.writeFileSync(conf,`listener 18884 127.0.0.1\nallow_anonymous false\npassword_file ${passwd.replaceAll('\\','/')}\n`);
const broker=spawn(path.join(tools,'mosquitto.exe'),['-c',conf],{cwd:tools,windowsHide:true,stdio:'ignore'});
let sub,pub;
try{
  await new Promise(r=>setTimeout(r,700));
  const opts={protocolVersion:4,username:'lab',password,reconnectPeriod:0,connectTimeout:3000};
  sub=await mqtt.connectAsync('mqtt://127.0.0.1:18884',{...opts,clientId:'node-sub'});await sub.subscribeAsync('lab/test',{qos:1});
  const received=new Promise(resolve=>sub.once('message',(_,p)=>resolve(p.toString())));
  pub=await mqtt.connectAsync('mqtt://127.0.0.1:18884',{...opts,clientId:'node-pub'});
  await pub.publishAsync('lab/test',JSON.stringify({temperature:28,humidity:65}),{qos:1});
  const value=await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('No Mosquitto message')),3000))]);
  if(JSON.parse(value).temperature!==28)throw Error('Payload mismatch');
  const bad=mqtt.connect('mqtt://127.0.0.1:18884',{...opts,clientId:'bad',password:'invalid'});
  const rejected=await new Promise(resolve=>{bad.on('error',()=>resolve(true));bad.on('connect',()=>resolve(false));});bad.end(true);if(!rejected)throw Error('Authentication failed');
  console.log('MOSQUITTO_OK version 2.0.17 | Node.js pub/sub JSON QoS1 | bad-password rejected');
}finally{await sub?.endAsync();await pub?.endAsync();broker.kill();}
