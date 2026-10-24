import { SerialPort } from 'serialport';
import mqtt from 'mqtt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const root=path.dirname(fileURLToPath(import.meta.url));
const secrets=JSON.parse(fs.readFileSync(path.join(root,'data','credentials.json')));
const ports=await SerialPort.list();
const portName=process.argv[2]||ports.find(p=>['303a','10c4','1a86'].includes(p.vendorId?.toLowerCase()))?.path;
if(!portName)throw Error('Không tìm thấy ESP32. Cắm USB hoặc truyền tên COM sau lệnh.');
const id=process.argv[3]||'esp32-room-01';
if(!/^esp32-room-0[12]$/.test(id))throw Error('Device ID không hợp lệ');
const lock=net.createServer();
await new Promise((resolve,reject)=>{lock.once('error',()=>reject(Error('Gateway cho thiết bị này đang chạy; không mở thêm một bản.')));lock.listen(id.endsWith('02')?18767:18766,'127.0.0.1',resolve);});
const port=new SerialPort({path:portName,baudRate:115200,autoOpen:false});
let buffer='',count=0,lastFrame=0,brokerUp=false;
const client=mqtt.connect(`mqtt://127.0.0.1:${process.env.IOT_MQTT_PORT||1883}`,{clientId:id,protocolVersion:4,username:'esp32',password:secrets.hardware,reconnectPeriod:2000,will:{topic:`iot/${id}/availability`,payload:'offline',retain:true}});
client.on('connect',()=>{brokerUp=true;client.subscribe(`iot/${id}/command`,{qos:1});console.log('MQTT connected');});
client.on('offline',()=>{brokerUp=false;});client.on('error',e=>console.warn('MQTT:',e.message));
client.on('message',(_,payload)=>{if(port.isOpen)port.write(JSON.stringify({type:'command',...JSON.parse(payload.toString())})+'\n');});
function open(){if(port.isOpen)return;port.open(err=>{if(err){console.warn('USB:',err.message);return;}console.log(`USB_GATEWAY_READY ${portName} -> iot/${id}`);buffer='';});}
port.on('data',bytes=>{buffer+=bytes.toString();if(buffer.length>16384)buffer='';let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);if(!line.startsWith('{')){if(line)console.log('Board:',line.slice(0,150));continue;}try{const f=JSON.parse(line);if(!['telemetry','state','availability'].includes(f.type))continue;if(f.deviceId!==id){console.warn('ID firmware không khớp gateway:',f.deviceId);continue;}lastFrame=Date.now();if(brokerUp){client.publish(`iot/${id}/availability`,'online',{retain:true});if(f.type!=='availability')client.publish(`iot/${id}/${f.type}`,JSON.stringify(f),{qos:1,retain:f.type==='state'});}if(f.type==='telemetry'&&++count%5===1)console.log(`Telemetry #${count}: ${f.temperature} C / ${f.humidity}%${f.synthetic?' [SYNTHETIC]':''}`);}catch{}}});
port.on('error',e=>console.warn('USB:',e.message));port.on('close',()=>{lastFrame=0;if(client.connected)client.publish(`iot/${id}/availability`,'offline',{retain:true});console.warn('USB disconnected; retrying');});
const timer=setInterval(()=>{if(!port.isOpen)open();if(client.connected&&Date.now()-lastFrame>15000)client.publish(`iot/${id}/availability`,'offline',{retain:true});},3000);open();
function stop(){clearInterval(timer);if(client.connected)client.publish(`iot/${id}/availability`,'offline',{retain:true},()=>client.end());else client.end(true);if(port.isOpen)port.close();setTimeout(()=>process.exit(0),600).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
