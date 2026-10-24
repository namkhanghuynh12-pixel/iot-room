import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Aedes } from 'aedes';
import { SerialPort } from 'serialport';
import { execFileSync } from 'node:child_process';
import { defaults, validateSettings, validateTelemetry, nextOutputs } from './logic.mjs';
import { startSimulator } from './simulator.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.IOT_DATA_DIR || path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const port = Number(process.env.PORT || process.env.IOT_HTTP_PORT || 8765), mqttPort = Number(process.env.IOT_MQTT_PORT || 1883);
const secretFile = path.join(dataDir, 'credentials.json');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, JSON.stringify({ hardware: randomBytes(18).toString('hex'), simulation: randomBytes(18).toString('hex'), accessToken:randomBytes(24).toString('hex') }, null, 2), { mode: 0o600 });
const secrets = JSON.parse(fs.readFileSync(secretFile));
if (!secrets.accessToken) { secrets.accessToken = randomBytes(24).toString('hex'); fs.writeFileSync(secretFile,JSON.stringify(secrets,null,2)); }
const db = new DatabaseSync(path.join(dataDir, 'room.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS samples(id INTEGER PRIMARY KEY,device TEXT NOT NULL,temperature REAL NOT NULL,humidity REAL NOT NULL,at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS samples_device_id ON samples(device,id); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at TEXT NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
const columns = db.prepare('PRAGMA table_info(samples)').all().map(x=>x.name);
for (const column of ['airQuality','light','motion']) if (!columns.includes(column)) db.exec(`ALTER TABLE samples ADD COLUMN ${column} REAL`);
const stored=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('config')?.value || '{}');
let settings = { ...defaults, ...Object.fromEntries(Object.entries(stored).filter(([k])=>k in defaults)) };
settings = validateSettings({}, settings);
const saveSettings = () => db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run('config', JSON.stringify(settings));
const devices = new Map(), streams = new Set(); let simulator, secondSimulator, shuttingDown = false;
const activeId = () => settings.source === 'simulation' ? settings.hardwareId.replace('esp32','sim') : settings.hardwareId;
function dev(id) { if (!devices.has(id)) devices.set(id, { id, online: false, temperature: null, humidity: null, airQuality:null, light:null, at: null, fan: null, buzzer:null, led: null, desiredFan: false, lastCommand: null, acknowledged: false, lastSent: 0, alert: false }); return devices.get(id); }
function log(kind, message) { db.prepare('INSERT INTO events(at,kind,message) VALUES(?,?,?)').run(new Date().toISOString(), kind, message); }
const latestHistory = (id, limit = 300) => db.prepare('SELECT id,temperature,humidity,airQuality,light,motion,at FROM samples WHERE device=? ORDER BY id DESC LIMIT ?').all(id, limit).reverse();
function snapshot() {
  const d = dev(activeId());
  const online = d.online && d.at !== null && Date.now() - Date.parse(d.at) < 15000;
  return { settings, device: { ...d, online }, devices:[...devices.values()].map(x=>({...x,online:x.online && x.at !== null && Date.now()-Date.parse(x.at)<15000})), simulator: (settings.hardwareId.endsWith('02') ? secondSimulator : simulator)?.status(), events: db.prepare('SELECT at,kind,message FROM events ORDER BY id DESC LIMIT 15').all(), broker: { port: mqttPort, ready: true }, gateway:{name:'Edge Gateway', protocol:'MQTT ↔ HTTP / USB Serial',storage:'SQLite',uptime:Math.floor(process.uptime())}, counts: db.prepare('SELECT COUNT(*) AS samples FROM samples WHERE device=?').get(activeId()), serverTime: new Date().toISOString() };
}
function broadcast() { const data = `data: ${JSON.stringify(snapshot())}\n\n`; for (const res of streams) { if (!res.writableEnded) res.write(data); } }
function publishCommand(d, force = false) {
  if (!d.id.startsWith(settings.source === 'simulation' ? 'sim-' : 'esp32-') || !d.online || !d.at || Date.now() - Date.parse(d.at) > 15000) return;
  const {fan,buzzer,led} = nextOutputs(settings.mode==='manual'&&d.id!==activeId()?{...settings,manualFan:false,manualBuzzer:false,led:false}:settings,d);
  if (!force && fan === d.desiredFan && buzzer === d.desiredBuzzer && led === d.desiredLed && d.acknowledged && Date.now() - d.lastSent < 10000) return;
  d.desiredFan = fan; d.desiredBuzzer = buzzer; d.desiredLed = led; d.lastCommand = randomUUID(); d.acknowledged = false; d.lastSent = Date.now();
  broker.publish({ topic: `iot/${d.id}/command`, payload: JSON.stringify({ fan, buzzer, led, commandId: d.lastCommand, ttlMs: 30000 }), qos: 1, retain: false }, err => { if (err) log('error', 'Không gửi được lệnh MQTT'); });
}
const broker = await Aedes.createBroker({ connectTimeout: 10000, queueLimit: 16 });
const equal = (a,b) => { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x,y); };
broker.authenticate = (client, username, password, cb) => {
  const role = username === 'esp32' ? 'hardware' : username === 'simulator' ? 'simulation' : null;
  const ok = Boolean(role && equal(password?.toString(), secrets[role]));
  const validId = role === 'hardware' ? /^esp32-room-0[12]$/.test(client.id) : /^sim-room-0[12]$/.test(client.id);
  if (ok && validId) client.roomDevice = client.id;
  cb(null, ok && validId);
};
broker.authorizePublish = (client, packet, cb) => {
  const base = client?.roomDevice ? `iot/${client.roomDevice}/` : '';
  if (client && (!base || !['telemetry','state','availability'].some(k => packet.topic === base + k) || packet.payload.length > 2048)) return cb(Error('Topic hoặc kích thước không được phép'));
  cb(null);
};
broker.authorizeSubscribe = (client, sub, cb) => cb(null, sub.topic === `iot/${client.roomDevice}/command` ? sub : null);
broker.on('clientError', (_, err) => { if (!shuttingDown) console.warn('MQTT client:', err.message); });
broker.on('connectionError', (_, err) => { if (!shuttingDown) console.warn('MQTT connection:', err.message); });
broker.on('clientDisconnect', client => { if (client.roomDevice) { dev(client.roomDevice).online = false; broadcast(); } });
broker.on('publish', (packet, client) => {
  if (!client?.roomDevice) return;
  const id = client.roomDevice, d = dev(id), kind = packet.topic.split('/')[2];
  try {
    if (kind === 'availability') { d.online = packet.payload.toString() === 'online'; if (!d.online) log('connection', `${id} ngắt kết nối`); }
    if (kind === 'telemetry') {
      const p = validateTelemetry(JSON.parse(packet.payload.toString())); Object.assign(d, p, { online: true, at: new Date().toISOString() });
      d.synthetic = JSON.parse(packet.payload.toString()).synthetic === true;
      db.prepare('INSERT INTO samples(device,temperature,humidity,airQuality,light,motion,at) VALUES(?,?,?,?,?,?,?)').run(id, p.temperature, p.humidity, p.airQuality,p.light,p.motion===null?null:Number(p.motion),d.at);
      const alert = p.temperature >= settings.onTemperature || p.humidity >= settings.humidityAlert || p.airQuality>=settings.airQualityOn;
      if (alert !== d.alert) { d.alert = alert; log(alert ? 'alert' : 'info', `${id}: ${alert ? 'Vượt ngưỡng' : 'Trở về bình thường'} (${p.temperature} °C / ${p.humidity} %)`); }
      publishCommand(d);
    }
    if (kind === 'state') {
      const p = JSON.parse(packet.payload.toString());
      if (typeof p.fan !== 'boolean' || typeof p.led !== 'boolean') throw Error('State không hợp lệ');
      const changed = d.fan !== p.fan || d.buzzer !== Boolean(p.buzzer) || d.led !== p.led; d.fan = p.fan; d.buzzer = Boolean(p.buzzer); d.led = p.led; d.buzzerLockout = Boolean(p.buzzerLockout);
      d.acknowledged = p.commandId != null && p.commandId === d.lastCommand;
      if (changed) log('control', `${id}: quạt ${p.fan ? 'BẬT' : 'TẮT'}, còi ${p.buzzer ? 'BẬT' : 'TẮT'}, đèn ${p.led ? 'BẬT' : 'TẮT'}`);
    }
    broadcast();
  } catch (err) { log('error', `${id}: bỏ qua gói ${kind} không hợp lệ`); broadcast(); }
});
const tcp = net.createServer(broker.handle);
await new Promise((resolve,reject) => { tcp.once('error',reject); tcp.listen(mqttPort, '0.0.0.0', resolve); });
simulator = startSimulator({ port: mqttPort, username: 'simulator', password: secrets.simulation, onChange: broadcast });
secondSimulator = startSimulator({ port: mqttPort, username: 'simulator', password: secrets.simulation, id:'sim-room-02',onChange:broadcast });
if (settings.source !== 'simulation') { simulator.configure({ enabled: false }); secondSimulator.configure({enabled:false}); }

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const addresses = Object.entries(os.networkInterfaces()).sort(([a],[b])=>Number(/wi-fi|wlan/i.test(b))-Number(/wi-fi|wlan/i.test(a))).flatMap(([,values])=>values).filter(x=>x?.family==='IPv4' && !x.internal).map(x=>x.address);
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, ...addresses.map(x=>`${x}:${port}`)]);
function json(res, body, status = 200) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) { let b = ''; for await (const c of req) { b += c; if (b.length > 8192) throw Error('Yêu cầu quá lớn'); } return JSON.parse(b || '{}'); }
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  const isAllowedHost = allowedHosts.has(req.headers.host) || process.env.RENDER || req.headers.host?.endsWith('.onrender.com') || req.headers.host?.includes('render.com');
  const originValid = !req.headers.origin || req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`;
  if (!isAllowedHost || !originValid) return json(res,{ error:'Địa chỉ truy cập không hợp lệ' },403);
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const token = req.headers.authorization?.replace(/^Bearer /,'') || req.headers.cookie?.match(/(?:^|;\s*)iot_session=([a-f0-9]+)/)?.[1];
    if (req.method === 'POST' && url.pathname === '/api/login') { const p = await body(req); if (!equal(p.token,secrets.accessToken)) return json(res,{error:'Mã truy cập không đúng'},401); res.setHeader('Set-Cookie',`iot_session=${secrets.accessToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`); return json(res,{ok:true}); }
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/health' && !local && !equal(token,secrets.accessToken)) return json(res,{error:'Vui lòng đăng nhập bằng mã truy cập trên laptop'},401);
    if(req.method==='POST' && url.pathname==='/api/shutdown' && local){json(res,{ok:true});setTimeout(stop,100);return;}
    if(req.method==='POST' && url.pathname==='/api/provision'){
      if(!local)return json(res,{error:'Chỉ cấu hình USB trên laptop máy chủ'},403);
      const p=await body(req);
      if(typeof p.ssid!=='string'||!p.ssid.length||Buffer.byteLength(p.ssid)>32||typeof p.password!=='string'||p.password.length>64||typeof p.broker!=='string'||!p.broker.length||p.broker.length>80||!/^COM\d+$/i.test(p.port)||!/^esp32-room-0[12]$/.test(p.deviceId))throw Error('Kiểm tra SSID, IP broker, COM và ID thiết bị');
      const serial=new SerialPort({path:p.port,baudRate:115200,autoOpen:false});
      await new Promise((resolve,reject)=>serial.open(err=>err?reject(Error('Không mở được COM. Đóng Serial Monitor/gateway USB trước.')):resolve()));
      try{
        await new Promise((resolve,reject)=>{
          let buffer='';const timer=setTimeout(()=>reject(Error('ESP32 chưa xác nhận cấu hình; kiểm tra đúng firmware và cổng COM')),10000);
          serial.on('error',()=>{clearTimeout(timer);reject(Error('Kết nối USB gián đoạn'));});
          serial.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>16384)buffer='';let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const a=JSON.parse(line);if(a.type==='provisionAck'){clearTimeout(timer);if(a.ok)resolve();else reject(Error('Board từ chối cấu hình'));}}catch{}}});
          const frame={type:'provision',ssid:p.ssid,password:p.password,broker:p.broker,mqttPassword:secrets.hardware,deviceId:p.deviceId};
          serial.write(JSON.stringify(frame)+'\n',err=>{if(err){clearTimeout(timer);reject(Error('Không gửi được cấu hình USB'));}});
        });
      }finally{if(serial.isOpen)await new Promise(resolve=>serial.close(resolve));}
      settings={...settings,source:'hardware',hardwareId:p.deviceId};saveSettings();simulator.configure({enabled:false});secondSimulator.configure({enabled:false});log('config','Đã gửi cấu hình Wi-Fi qua USB; chờ ESP32 kết nối');broadcast();return json(res,{ok:true,message:'ESP32 đã lưu cấu hình và đang kết nối Wi-Fi. Đợi khoảng 15 giây.'});
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res,{ok:true,app:'iot-room',port,mqttPort});
    if(req.method==='GET' && url.pathname==='/downloads/android.apk'){
      const apk=path.join(root,'clients/android/PhongIoT-debug.apk');
      if(!fs.existsSync(apk))return json(res,{error:'APK chưa được build'},404);
      res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="PhongIoT-debug.apk"'});fs.createReadStream(apk).pipe(res);return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res,snapshot());
    if (req.method === 'GET' && url.pathname === '/api/history') return json(res,latestHistory(activeId(),1000));
    if (req.method === 'GET' && url.pathname === '/api/setup') {
      let ssid='';try{if(process.platform==='win32')ssid=execFileSync('netsh.exe',['wlan','show','interfaces'],{encoding:'utf8',windowsHide:true,timeout:3000}).match(/^\s+SSID\s*:\s*(.+)$/m)?.[1]?.trim()||'';}catch{}
      const ports=(await SerialPort.list()).map(x=>x.path);
      return json(res,{ addresses, ssid,ports,port,mqttPort, username:'esp32', password:secrets.hardware, accessToken:secrets.accessToken, deviceId:'esp32-room-01', firmware:'firmware/room_monitor/room_monitor.ino' });
    }
    if (req.method === 'GET' && url.pathname === '/api/export') {
      const rows = db.prepare('SELECT at,device,temperature,humidity,airQuality,light FROM samples WHERE device=? ORDER BY id DESC LIMIT 100000').all(activeId()).reverse();
      res.writeHead(200, { 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="iot-history.csv"' });
      return res.end('\uFEFFtime_utc,device,temperature_c,humidity_percent,airQuality_percent,light_percent\r\n'+rows.map(r=>`${r.at},${r.device},${r.temperature},${r.humidity},${r.airQuality ?? ''},${r.light ?? ''}`).join('\r\n'));
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
      streams.add(res); res.write(`data: ${JSON.stringify(snapshot())}\n\n`); req.on('close',()=>streams.delete(res)); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const previousSource = settings.source;
      const candidate = validateSettings(await body(req),settings);
      if (candidate.source !== previousSource) for (const oldDevice of devices.values()) if (oldDevice.online) broker.publish({topic:`iot/${oldDevice.id}/command`,payload:JSON.stringify({fan:false,buzzer:false,led:false,commandId:randomUUID(),ttlMs:30000}),qos:1,retain:false},()=>{});
      settings = candidate; saveSettings();
      if (settings.source !== previousSource) { simulator.configure({ enabled:settings.source === 'simulation' }); secondSimulator.configure({enabled:settings.source==='simulation'}); }
      log('config', `Chế độ ${settings.source === 'simulation' ? 'mô phỏng' : 'ESP32 thật'} / ${settings.mode === 'auto' ? 'tự động' : 'thủ công'}`);
      for (const d of devices.values()) publishCommand(d,true); broadcast(); return json(res,snapshot());
    }
    if (req.method === 'POST' && url.pathname === '/api/simulator') {
      if (settings.source !== 'simulation') return json(res,{error:'Chuyển sang mô phỏng trước'},409);
      const result = (settings.hardwareId.endsWith('02')?secondSimulator:simulator).configure(await body(req)); broadcast(); return json(res,result);
    }
    if (req.method !== 'GET') return json(res,{error:'Không tìm thấy'},404);
    const files = { '/':'index.html', '/app.js':'app.js', '/style.css':'style.css', '/manifest.webmanifest':'manifest.webmanifest', '/sw.js':'sw.js', '/icon.svg':'icon.svg' };
    const file = files[url.pathname]; if (!file) return json(res,{error:'Không tìm thấy'},404);
    res.writeHead(200, { 'Content-Type':mime[path.extname(file)], 'Cache-Control':'no-cache' }); res.end(fs.readFileSync(path.join(root,'public',file)));
  } catch (err) { json(res,{error:err.message},400); }
});
await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'0.0.0.0',resolve); });
const heartbeat = setInterval(() => { for (const d of devices.values()) publishCommand(d); broadcast(); for (const s of streams) s.write(': heartbeat\n\n'); }, 3000);
const cleanup = setInterval(() => { db.prepare("DELETE FROM samples WHERE at < ?").run(new Date(Date.now()-90*86400000).toISOString()); db.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 2000)'); }, 3600000);
log('info','Máy chủ khởi động');
console.log(`IOT_ROOM_READY http://localhost:${port} MQTT:${mqttPort}`);
async function stop() { if (shuttingDown) return; shuttingDown = true; clearInterval(heartbeat); clearInterval(cleanup); simulator.close(); secondSimulator.close(); for (const s of streams) s.end(); server.close(); tcp.close(); broker.close(()=>{ db.close(); process.exit(0); }); setTimeout(()=>process.exit(0),2000).unref(); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
