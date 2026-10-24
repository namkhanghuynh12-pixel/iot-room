import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(root,'tools/arduino-cli/arduino-cli.exe');
const config=path.join(root,'tools/arduino-cli-short.yaml');
if(process.platform==='win32'){
 const toolData=path.join(root,'tools/arduino-data');
 const mappings=execFileSync('subst.exe',[],{encoding:'utf8',windowsHide:true}).split(/\r?\n/);
 let drive=mappings.find(line=>line.toLowerCase().endsWith(toolData.toLowerCase()))?.slice(0,2);
 if(!drive){drive=['P','Q','R','S','T','U','V','W','X','Y','Z'].map(x=>x+':').find(x=>!fs.existsSync(x+'\\'));if(!drive)throw Error('Cần một ký tự ổ trống để rút gọn đường dẫn bộ biên dịch');execFileSync('subst.exe',[drive,toolData],{windowsHide:true});}
 const original=fs.readFileSync(path.join(root,'tools/arduino-cli.yaml'),'utf8');
 fs.writeFileSync(config,original.replace(/^  data:.*$/m,'  data: '+drive+'/'));
}
const fqbn='esp32:esp32:esp32c5:FlashSize=16M,PSRAM=enabled,CDCOnBoot=cdc,PartitionScheme=default_8MB';
const sketch=path.join(root,'firmware/room_monitor'),build=path.join(root,'data/build-c5-short');
fs.mkdirSync(build,{recursive:true});
execFileSync(cli,['--config-file',config,'compile','--fqbn',fqbn,'--build-path',build,sketch],{stdio:'inherit',windowsHide:true});
console.log('FIRMWARE_BUILD_OK ESP32-C5 N16R8');
if(process.argv.includes('--upload')){
 const index=process.argv.indexOf('--port'),port=index>=0?process.argv[index+1]:'COM16';
 if(!fs.existsSync(path.join(root,'data/backup/esp32-c5-original.bin')))throw Error('Cần sao lưu Flash gốc trước lần nạp đầu.');
 execFileSync(cli,['--config-file',config,'upload','--fqbn',fqbn,'--port',port,'--input-dir',build,sketch],{stdio:'inherit',windowsHide:true});
 console.log('FIRMWARE_UPLOAD_OK '+port);
}
