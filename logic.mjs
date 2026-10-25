export const defaults = { source: 'simulation', hardwareId: 'esp32-room-01', mode: 'auto', onTemperature: 30, offTemperature: 28, humidityAlert: 80, airQualityOn: 70, airQualityOff: 55, lightOn: 25, lightOff: 40, manualFan: false, manualBuzzer: false, led: false };
export function validateSettings(input, old) {
  const allowed = Object.keys(defaults);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) throw Error('Cấu hình không hợp lệ');
  const s = { ...old, ...input };
  if (!['simulation','hardware'].includes(s.source) || !['auto','manual'].includes(s.mode)) throw Error('Chế độ không hợp lệ');
  if (!['esp32-room-01','esp32-room-02'].includes(s.hardwareId)) throw Error('ID thiết bị không hợp lệ');
  for (const k of ['onTemperature','offTemperature','humidityAlert']) if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) throw Error('Ngưỡng phải là số');
  if (s.offTemperature < 0 || s.onTemperature > 60 || s.onTemperature - s.offTemperature < 1 || s.humidityAlert < 1 || s.humidityAlert > 100) throw Error('Ngưỡng bật phải cao hơn ngưỡng tắt ít nhất 1 °C; nhiệt độ 0–60 °C');
  for(const k of ['airQualityOn','airQualityOff','lightOn','lightOff'])if(typeof s[k]!=='number'||!Number.isFinite(s[k])||s[k]<0||s[k]>100)throw Error('Ngưỡng khí/ánh sáng phải trong 0–100');
  if(s.airQualityOn-s.airQualityOff<5||s.lightOff-s.lightOn<5)throw Error('Ngưỡng bật/tắt khí và ánh sáng cần cách nhau ít nhất 5 điểm');
  for (const k of ['manualFan','manualBuzzer','led']) if (typeof s[k] !== 'boolean') throw Error('Trạng thái phải là true hoặc false');
  return s;
}
export function validateTelemetry(p) {
  if (!p || typeof p !== 'object' || typeof p.temperature !== 'number' || !Number.isFinite(p.temperature) || p.temperature < -40 || p.temperature > 80 || typeof p.humidity !== 'number' || !Number.isFinite(p.humidity) || p.humidity < 0 || p.humidity > 100) throw Error('Dữ liệu cảm biến không hợp lệ');
  for (const k of ['airQuality','light']) if (p[k] !== undefined && (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100)) throw Error('Khí/ánh sáng không hợp lệ');
  if(p.motion!==undefined&&typeof p.motion!=='boolean')throw Error('Chuyển động phải là boolean');
  return { temperature: p.temperature, humidity: p.humidity, airQuality: null, light: p.light ?? null, motion:p.motion??null };
}
export function nextOutputs(s, d) {
  const fan = nextFan(s,d.temperature,d.desiredFan);
  const hysteresis = (value,on,off,previous) => value === null ? false : value <= on ? true : value >= off ? false : Boolean(previous);
  // Không đo MQ135: còi chỉ nhận lệnh thủ công. Giữ trường legacy để đọc database cũ.
  return { fan, buzzer: s.mode === 'manual' ? s.manualBuzzer : false, led: s.mode === 'manual' ? s.led : d.motion !== true ? false : hysteresis(d.light,s.lightOn,s.lightOff,d.desiredLed) };
}
export function nextFan(s, temp, current = false) {
  if (s.mode === 'manual') return s.manualFan;
  if (temp >= s.onTemperature) return true;
  if (temp <= s.offTemperature) return false;
  return current;
}
