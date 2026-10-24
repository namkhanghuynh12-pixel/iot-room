import mqtt from 'mqtt';
export function startSimulator({ port, username, password, onChange, id = 'sim-room-01' }) {
  let enabled = true, scenario = 'normal', temperature = 27.2, humidity = 61, airQuality = 20, light = 65, motion=true, fan = false, buzzer = false, led = false, lastCommand = 0, buzzerStarted = 0, buzzerLockout = false;
  const prefix = `iot/${id}`;
  const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: id, protocolVersion: 4, username, password, reconnectPeriod: 1500, will: { topic: `${prefix}/availability`, payload: 'offline', retain: true } });
  function sendState(commandId = null) { if (client.connected && enabled) client.publish(`${prefix}/state`, JSON.stringify({ fan, buzzer, led, buzzerLockout, commandId }), { qos: 1, retain: true }); }
  function sample() {
    if (!enabled || !client.connected) return;
    if (scenario === 'normal') { temperature = Math.max(24, Math.min(29, temperature + (27 - temperature) * .12 + (Math.random() - .5) * .35)); humidity = Math.max(40, Math.min(75, humidity + (60 - humidity) * .1)); }
    if (scenario === 'hot') { temperature = Math.min(38, temperature + .65); humidity = Math.min(88, humidity + .3); }
    if (scenario === 'cool') { temperature = Math.max(24, temperature - .75); humidity = Math.max(55, humidity - .4); }
    if (scenario === 'polluted') airQuality = Math.min(95,airQuality+7);
    if (scenario === 'dark') light = Math.max(5,light-6);
    if(scenario==='normal') {airQuality=Math.max(10,airQuality+(20-airQuality)*.25);light=Math.min(65,light+4);}
    client.publish(`${prefix}/telemetry`, JSON.stringify({ temperature: +temperature.toFixed(1), humidity: +humidity.toFixed(1), airQuality:+airQuality.toFixed(1), light:+light.toFixed(1),motion,synthetic:true }), { qos: 1 });
    if (buzzer && Date.now()-buzzerStarted > 10000) { buzzer = false; buzzerLockout = true; sendState(); }
    if ((fan || buzzer || led) && Date.now() - lastCommand > 30000) { fan = buzzer = led = false; sendState(); }
  }
  client.on('connect', () => { client.subscribe(`${prefix}/command`, { qos: 1 }, () => { if (enabled) { client.publish(`${prefix}/availability`, 'online', { retain: true }); sendState(); sample(); } }); });
  client.on('message', (_, payload) => { try { const c = JSON.parse(payload); if (!enabled || typeof c.fan !== 'boolean' || typeof c.led !== 'boolean') return; fan = c.fan; led = c.led; if (!c.buzzer) buzzerLockout = false; if (c.buzzer && !buzzer && !buzzerLockout) buzzerStarted = Date.now(); buzzer = Boolean(c.buzzer && !buzzerLockout); lastCommand = Date.now(); sendState(c.commandId); } catch {} });
  client.on('error', () => {});
  const timer = setInterval(sample, 2000);
  const safety = setInterval(()=>{if(buzzer && Date.now()-buzzerStarted>=10000){buzzer=false;buzzerLockout=true;sendState();}if((fan||buzzer||led)&&Date.now()-lastCommand>30000){fan=buzzer=led=false;sendState();}},100);
  return {
    status: () => ({ enabled, scenario, temperature: +temperature.toFixed(1), humidity: +humidity.toFixed(1), airQuality, light,motion }),
    configure(p) {
      if (p.enabled !== undefined && typeof p.enabled !== 'boolean') throw Error('enabled không hợp lệ');
      if (p.scenario !== undefined && !['normal','hot','cool','polluted','dark','custom'].includes(p.scenario)) throw Error('Kịch bản không hợp lệ');
      for (const k of ['airQuality','light']) if (p[k] !== undefined && (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k]<0 || p[k]>100)) throw Error('Đất/ánh sáng không hợp lệ');
      if (p.temperature !== undefined && (typeof p.temperature !== 'number' || !Number.isFinite(p.temperature) || p.temperature < -40 || p.temperature > 80)) throw Error('Nhiệt độ không hợp lệ');
      if (p.humidity !== undefined && (typeof p.humidity !== 'number' || !Number.isFinite(p.humidity) || p.humidity < 0 || p.humidity > 100)) throw Error('Độ ẩm không hợp lệ');
      if (p.scenario !== undefined) scenario = p.scenario;
      if (p.temperature !== undefined) temperature = p.temperature;
      if (p.humidity !== undefined) humidity = p.humidity;
      if (p.airQuality !== undefined) airQuality = p.airQuality;
      if (p.light !== undefined) light = p.light;
      if(p.motion!==undefined){if(typeof p.motion!=='boolean')throw Error('motion không hợp lệ');motion=p.motion;}
      if (p.enabled !== undefined) { if(!p.enabled){fan=buzzer=led=false;sendState();} enabled = p.enabled; if (client.connected) client.publish(`${prefix}/availability`, enabled ? 'online' : 'offline', { retain: true }); if (enabled) sendState(); }
      sample(); onChange?.(); return this.status();
    },
    close: () => { clearInterval(timer); clearInterval(safety); client.end(true); }
  };
}
