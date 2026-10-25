import { SerialPort } from 'serialport';
import mqtt from 'mqtt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = path.dirname(fileURLToPath(import.meta.url));
const secrets = JSON.parse(fs.readFileSync(path.join(root, 'data', 'credentials.json')));

const id = process.argv[3] || 'esp32-room-01';
if (!/^esp32-room-0[12]$/.test(id)) throw Error('Device ID không hợp lệ');

// Lock to prevent duplicate gateway instances
const lock = net.createServer();
await new Promise((resolve, reject) => {
  lock.once('error', () => reject(Error('Gateway cho thiết bị này đang chạy; không mở thêm một bản.')));
  lock.listen(id.endsWith('02') ? 18767 : 18766, '127.0.0.1', resolve);
});

async function findPort() {
  const ports = await SerialPort.list();
  if (process.argv[2] && ports.some(p => p.path.toUpperCase() === process.argv[2].toUpperCase())) {
    return process.argv[2];
  }
  const found = ports.find(p =>
    ['303a', '10c4', '1a86'].includes(p.vendorId?.toLowerCase()) ||
    /ch340|cp210|usb-serial|esp32/i.test(p.friendlyName || '')
  );
  return found?.path || null;
}

let activePort = null;
let currentPortName = null;
let buffer = '';
let count = 0;
let lastFrame = 0;
let brokerUp = false;
let isOpening = false;

// Connect with clientId "-gw" so Wi-Fi and USB never kick each other
const client = mqtt.connect(`mqtt://127.0.0.1:${process.env.IOT_MQTT_PORT || 1883}`, {
  clientId: id + '-gw',
  protocolVersion: 4,
  username: 'esp32',
  password: secrets.hardware,
  reconnectPeriod: 2000,
  will: { topic: `iot/${id}/availability`, payload: 'offline', retain: true }
});

client.on('connect', () => {
  brokerUp = true;
  client.subscribe(`iot/${id}/command`, { qos: 1 });
  console.log(`MQTT connected as ${id}-gw`);
});

client.on('offline', () => { brokerUp = false; });
client.on('error', e => console.warn('MQTT:', e.message));

client.on('message', (_, payload) => {
  if (activePort && activePort.isOpen) {
    activePort.write(JSON.stringify({ type: 'command', ...JSON.parse(payload.toString()) }) + '\n');
  }
});

async function openPort() {
  if (isOpening || (activePort && activePort.isOpen)) return;
  isOpening = true;

  try {
    const portName = await findPort();
    if (!portName) {
      isOpening = false;
      return;
    }

    if (activePort) {
      try { activePort.close(); } catch {}
      activePort = null;
    }

    currentPortName = portName;
    const port = new SerialPort({ path: portName, baudRate: 115200, autoOpen: false });

    port.on('data', bytes => {
      buffer += bytes.toString();
      if (buffer.length > 16384) buffer = '';
      let n;
      while ((n = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, n).trim();
        buffer = buffer.slice(n + 1);
        if (!line.startsWith('{')) {
          if (line) console.log('Board:', line.slice(0, 150));
          continue;
        }
        try {
          const f = JSON.parse(line);
          if (!['telemetry', 'state', 'availability'].includes(f.type)) continue;
          if (f.deviceId !== id) {
            console.warn('ID firmware không khớp gateway:', f.deviceId);
            continue;
          }
          lastFrame = Date.now();
          if (brokerUp) {
            client.publish(`iot/${id}/availability`, 'online', { retain: true });
            if (f.type !== 'availability') {
              client.publish(`iot/${id}/${f.type}`, JSON.stringify(f), { qos: 1, retain: f.type === 'state' });
            }
          }
          if (f.type === 'telemetry' && ++count % 5 === 1) {
            console.log(`Telemetry #${count}: ${f.temperature} C / ${f.humidity}%${f.synthetic ? ' [SYNTHETIC]' : ''}`);
          }
        } catch {}
      }
    });

    port.on('error', e => {
      console.warn(`USB [${portName}]:`, e.message);
      try { port.close(); } catch {}
    });

    port.on('close', () => {
      lastFrame = 0;
      console.warn(`USB [${portName}] disconnected; retrying...`);
      activePort = null;
    });

    port.open(err => {
      isOpening = false;
      if (err) {
        console.warn(`USB [${portName}]:`, err.message);
        activePort = null;
        return;
      }
      activePort = port;
      buffer = '';
      console.log(`USB_GATEWAY_READY ${portName} -> iot/${id}`);
    });
  } catch (err) {
    isOpening = false;
    console.warn('Scan port error:', err.message);
  }
}

const timer = setInterval(() => {
  if (!activePort || !activePort.isOpen) openPort();
  if (client.connected && Date.now() - lastFrame > 20000) {
    client.publish(`iot/${id}/availability`, 'offline', { retain: true });
  }
}, 3000);

openPort();

function stop() {
  clearInterval(timer);
  if (client.connected) client.publish(`iot/${id}/availability`, 'offline', { retain: true }, () => client.end());
  else client.end(true);
  if (activePort && activePort.isOpen) activePort.close();
  setTimeout(() => process.exit(0), 600).unref();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
