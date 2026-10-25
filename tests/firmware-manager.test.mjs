import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateFlashRequest,parseChip,assertSameBoard,readFlashPlan,gatewayReleaseTarget,serialBuildMode} from '../firmware-manager.mjs';

test('CH340 uses UART Serial while native Espressif USB uses CDC',()=>{
  assert.equal(serialBuildMode({vendorId:'1A86'}).cdc,'default');
  assert.equal(serialBuildMode({vendorId:'10C4'}).cdc,'default');
  assert.equal(serialBuildMode({vendorId:'303A'}).cdc,'cdc');
  assert.throws(()=>serialBuildMode({vendorId:'unknown'}));
});

test('replacing COM16 with COM18 releases the old room gateway while preserving the other room',()=>{
  assert.deepEqual(gatewayReleaseTarget('COM18','esp32-room-01',18766),{});
  assert.deepEqual(gatewayReleaseTarget('COM18','esp32-room-01',18767),{port:'COM18'});
  assert.deepEqual(gatewayReleaseTarget('COM16','esp32-room-02',18767),{});
  assert.deepEqual(gatewayReleaseTarget('COM16','esp32-room-02',18766),{port:'COM16'});
});

test('flashing accepts only present COM ports and known device IDs',()=>{
  const ports=[{path:'COM16'}];
  assert.deepEqual(validateFlashRequest({port:'com16',deviceId:'esp32-room-02'},ports),{port:'COM16',deviceId:'esp32-room-02',backupMode:'affected'});
  assert.throws(()=>validateFlashRequest({port:'COM16',deviceId:'esp32-room-01',backupMode:'none'},ports));
  for(const input of [{port:'COM18',deviceId:'esp32-room-01'},{port:'COM16 & whoami',deviceId:'esp32-room-01'},{port:'../../data',deviceId:'esp32-room-01'},{port:'COM16',deviceId:'other'},{port:'COM16',deviceId:'esp32-room-01',firmware:'elsewhere.bin'}])assert.throws(()=>validateFlashRequest(input,ports));
});
test('chip identification rejects unsupported hardware and unknown flash capacity',()=>{
  const text='Connected to ESP32-C5 on COM16:\nMAC: 10:bd:a3:dc:55:ac\nDetected flash size: 16MB';
  const chip=parseChip(text);assert.equal(chip.flashMB,16);assert.equal(chip.chip,'ESP32-C5');
  assert.throws(()=>parseChip(text.replace('ESP32-C5','ESP32-S3')));
  assert.throws(()=>parseChip(text.replace('16MB','64MB')));
  assert.throws(()=>parseChip('Connecting... failed'));
});
test('a changed MAC, chip or flash size cancels upload after backup',()=>{
  const chip={mac:'10:bd:a3:dc:55:ac',chip:'ESP32-C5',flashMB:16};
  assert.doesNotThrow(()=>assertSameBoard(chip,{...chip}));
  for(const patch of [{mac:'10:bd:a3:dc:7f:90'},{chip:'ESP32-S3'},{flashMB:8}])assert.throws(()=>assertSameBoard(chip,{...chip,...patch}));
});
test('backup coverage includes every compiler-selected write sector and NVS',()=>{
  const build=mkdtempSync(join(tmpdir(),'iot-flash-plan-'));
  writeFileSync(join(build,'room_monitor.ino.bin'),Buffer.alloc(12345));
  writeFileSync(join(build,'boot.bin'),Buffer.alloc(100));
  writeFileSync(join(build,'flash_args'),'--flash-mode dio\n0x2000 boot.bin\n0x10000 room_monitor.ino.bin\n');
  const plan=readFlashPlan(build,16*1048576);assert.equal(plan.segments.length,2);assert.equal(plan.affectedBytes,81920);
  assert.ok(plan.segments.every(s=>s.address+s.size<=plan.affectedBytes));
  assert.throws(()=>readFlashPlan(build,65536));
  writeFileSync(join(build,'flash_args'),'0x10000 ../room_monitor.ino.bin\n');assert.throws(()=>readFlashPlan(build,16*1048576));
});
