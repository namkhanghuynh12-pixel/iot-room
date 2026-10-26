import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {sendWifiConfiguration} from '../provision-usb.mjs';
const frame={type:'provision',ssid:'test-only',password:'test-only',broker:'localhost',deviceId:'esp32-room-01'};
class Port extends EventEmitter{
  writes=0;
  set(lines,cb){assert.deepEqual(lines,{dtr:true,rts:false});cb();}
  write(text,cb){this.writes++;assert.deepEqual(JSON.parse(text),frame);cb();this.afterWrite?.();}
}
test('Wi-Fi provisioning retries while booting and resolves only on board ACK',async()=>{
  const port=new Port();port.afterWrite=()=>{if(port.writes===2){port.emit('data',Buffer.from('boot log\n{"type":"state"}\n{"type":"provision'));port.emit('data',Buffer.from('Ack","ok":true}\n'));}};
  await sendWifiConfiguration(port,frame,{settleMs:1,retryMs:5,timeoutMs:200});
  assert.equal(port.writes,2);assert.equal(port.listenerCount('data'),0);assert.equal(port.listenerCount('error'),0);
});
test('Serial writes without an ACK time out and stop resending',async()=>{
  const port=new Port();await assert.rejects(sendWifiConfiguration(port,frame,{settleMs:1,retryMs:5,timeoutMs:30}),/chưa xác nhận/);
  const count=port.writes;await new Promise(r=>setTimeout(r,15));assert.equal(port.writes,count);assert.equal(port.listenerCount('data'),0);
});
test('rejected Wi-Fi settings and disconnected USB are not successes',async()=>{
  const rejected=new Port();rejected.afterWrite=()=>rejected.emit('data',Buffer.from('{"type":"provisionAck","ok":false}\n'));
  await assert.rejects(sendWifiConfiguration(rejected,frame,{settleMs:1,timeoutMs:100}),/từ chối/);
  const disconnected=new Port();disconnected.afterWrite=()=>disconnected.emit('error',Error('USB lost'));
  await assert.rejects(sendWifiConfiguration(disconnected,frame,{settleMs:1,timeoutMs:100}),/gián đoạn/);
});
