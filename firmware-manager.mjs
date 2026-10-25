import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { SerialPort } from 'serialport';

export function validateFlashRequest(input,ports){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['port','deviceId','backupMode'].includes(k)))throw Error('Yêu cầu nạp không hợp lệ');
  if(typeof input.port!=='string'||!/^COM\d{1,4}$/i.test(input.port))throw Error('Chọn một cổng COM hợp lệ');
  if(!['esp32-room-01','esp32-room-02'].includes(input.deviceId))throw Error('Chọn Phòng 01 hoặc Phòng 02');
  if(input.backupMode!==undefined&&!['affected','full'].includes(input.backupMode))throw Error('Chọn sao lưu vùng sẽ ghi hoặc toàn bộ Flash');
  const port=ports.find(p=>p.path.toUpperCase()===input.port.toUpperCase());
  if(!port)throw Error('Cổng đã chọn không còn kết nối. Quét lại cổng COM.');
  return {port:port.path,deviceId:input.deviceId,backupMode:input.backupMode||'affected'};
}
export function parseBoardIdentity(output){
  const chip=/Connected to (ESP32[\w-]*) on/i.exec(output)?.[1]?.toUpperCase();
  const mac=/(?:BASE MAC|MAC):\s*([0-9a-f:]+)/i.exec(output)?.[1]?.toLowerCase();
  if(chip!=='ESP32-C5')throw Error(`Firmware này chỉ hỗ trợ ESP32-C5. Board nhận diện: ${chip||'chưa rõ'}. Chưa ghi Flash.`);
  if(!mac)throw Error('Không nhận diện được MAC của board.');
  return {chip,mac};
}
export function parseChip(output){
  const {chip,mac}=parseBoardIdentity(output);
  const flashMB=Number(/Detected flash size:\s*(\d+)MB/i.exec(output)?.[1]);
  if(![4,8,16].includes(flashMB)||!mac)throw Error('Không xác định được Flash/MAC an toàn; chưa ghi firmware.');
  return {chip,flashMB,mac};
}
export function assertSameBoard(expected,actual){
  if(expected.mac!==actual.mac||expected.chip!==actual.chip||expected.flashMB!==actual.flashMB)throw Error('Board/cổng đã thay đổi sau sao lưu. Hủy nạp để tránh ghi nhầm board.');
}
export function readFlashPlan(build,flashBytes){
  const text=fs.readFileSync(path.join(build,'flash_args'),'utf8');
  const segments=[];
  for(const line of text.split(/\r?\n/)){
    const match=/^\s*(0x[0-9a-f]+)\s+(\S+)\s*$/i.exec(line);if(!match)continue;
    const address=Number(match[1]),filename=match[2];
    if(path.basename(filename)!==filename||!filename.endsWith('.bin'))throw Error('Đường dẫn ảnh firmware không hợp lệ');
    const file=path.join(build,filename),size=fs.statSync(file).size;
    if(!size||address+size>flashBytes)throw Error('Ảnh firmware vượt phạm vi Flash');
    segments.push({address,file,size});
  }
  if(!segments.length||!segments.some(s=>path.basename(s.file)==='room_monitor.ino.bin'))throw Error('Thiếu danh sách địa chỉ nạp từ bản biên dịch');
  const affectedBytes=Math.ceil(Math.max(...segments.map(s=>s.address+s.size),0xe000)/4096)*4096;
  return {segments,affectedBytes};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function gatewayReleaseTarget(port,deviceId,controlPort){
  // A room ID has one gateway even when its replacement board has another COM port.
  const roomPort=deviceId==='esp32-room-01'?18766:deviceId==='esp32-room-02'?18767:null;
  return controlPort===roomPort?{}:{port};
}

export class FirmwareManager {
  constructor({root,dataDir,secrets,onPrepare,onConnected,isAcknowledged}){
    Object.assign(this,{root,dataDir,secrets,onPrepare,onConnected,isAcknowledged});
    this.cli=path.join(root,'tools/arduino-cli/arduino-cli.exe');
    this.toolData=path.join(root,'tools/arduino-data');
    const toolRoot=path.join(this.toolData,'packages/esp32/tools/esptool_py');
    const versions=fs.existsSync(toolRoot)?fs.readdirSync(toolRoot).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})):[];
    this.esptool=versions.length?path.join(toolRoot,versions[0],'esptool.exe'):'';
    this.stateFile=path.join(dataDir,'firmware-job.json');this.children=new Set();
    try{this.job=JSON.parse(fs.readFileSync(this.stateFile,'utf8'));if(this.job.status==='running')this.job={...this.job,status:'error',phase:'interrupted',message:'Máy chủ đã khởi động lại trong phiên nạp trước. Kiểm tra board rồi thử lại.'};}catch{this.job=null;}
  }
  available(){return process.platform==='win32'&&fs.existsSync(this.cli)&&fs.existsSync(this.esptool)&&fs.existsSync(path.join(this.root,'firmware/room_monitor/room_monitor.ino'));}
  busy(){return this.starting||this.job?.status==='running';}
  status(){return {available:this.available(),supportedChip:'ESP32-C5',message:this.available()?'Nạp code đồ án qua USB trên laptop này.':'Máy chủ này không có công cụ nạp ESP32. Mở bản local trên laptop.',job:this.job};}
  persist(){try{fs.writeFileSync(this.stateFile,JSON.stringify(this.job,null,2));}catch{}}
  phase(phase,message){Object.assign(this.job,{phase,message,uploadPercent:null});this.persist();}
  log(line){
    line=String(line).replace(/\x1b\[[0-9;]*m/g,'').trim();if(!line)return;
    if(/DEFAULT_MQTT_PASS/.test(line))line='[Ẩn dòng cấu hình bảo mật]';
    for(const value of Object.values(this.secrets))if(typeof value==='string'&&value.length>8)line=line.split(value).join('[ẩn]');
    if(this.job.phase==='upload'){const p=/\]\s*(\d+(?:\.\d+)?)%/.exec(line);if(p)this.job.uploadPercent=Number(p[1]);}
    this.job.logs.push(line.slice(0,500));if(this.job.logs.length>140)this.job.logs.shift();
  }
  run(exe,args,timeoutMs=120000){
    return new Promise((resolve,reject)=>{
      const child=spawn(exe,args,{cwd:this.root,windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});this.children.add(child);
      let output='',pending='',expired=false;
      const receive=data=>{const text=data.toString();output=(output+text).slice(-200000);pending+=text;const lines=pending.split(/[\r\n]+/);pending=lines.pop();for(const line of lines)this.log(line);};
      child.stdout.on('data',receive);child.stderr.on('data',receive);
      const timer=setTimeout(()=>{expired=true;if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();},timeoutMs);
      child.on('error',error=>{clearTimeout(timer);this.children.delete(child);reject(error);});
      child.on('close',code=>{clearTimeout(timer);this.children.delete(child);if(pending)this.log(pending);if(expired)return reject(Error('Công cụ quá thời gian chờ. Kiểm tra cáp USB/BOOT và thử lại.'));if(code!==0)return reject(Error('Công cụ nạp báo lỗi. Đóng Serial Monitor, kiểm tra cáp và giữ BOOT khi Connecting. Xem nhật ký bên dưới.'));resolve(output);});
    });
  }
  async releaseGateway(port,deviceId){
    const release=controlPort=>new Promise(resolve=>{
      const socket=net.connect(controlPort,'127.0.0.1');let data='';let done=false;
      const finish=()=>{if(done)return;done=true;socket.destroy();resolve();};
      socket.setTimeout(1200,finish);socket.on('error',finish);socket.on('close',finish);
      socket.on('connect',()=>socket.write(JSON.stringify({action:'release',...gatewayReleaseTarget(port,deviceId,controlPort),token:this.secrets.hardware})+'\n'));
      socket.on('data',chunk=>{data+=chunk.toString();if(data.includes('\n'))finish();});
    });
    await Promise.all([release(18766),release(18767)]);await sleep(900);
  }
  configureToolchain(){
    const mappings=execFileSync('subst.exe',[],{encoding:'utf8',windowsHide:true}).split(/\r?\n/);
    let drive=mappings.find(line=>line.toLowerCase().endsWith(this.toolData.toLowerCase()))?.slice(0,2);
    if(!drive){drive=['P','Q','R','S','T','U','V','W','X','Y','Z'].map(x=>x+':').find(x=>!fs.existsSync(x+'\\'));if(!drive)throw Error('Không còn ký tự ổ trống cho toolchain.');execFileSync('subst.exe',[drive,this.toolData],{windowsHide:true});}
    const config=path.join(this.dataDir,'arduino-firmware-web.yaml');
    fs.writeFileSync(config,fs.readFileSync(path.join(this.root,'tools/arduino-cli.yaml'),'utf8').replace(/^  data:.*$/m,'  data: '+drive+'/'));
    return config;
  }
  async start(input){
    if(this.busy())throw Error('Đang có một phiên nạp. Đợi hoàn tất trước khi nạp tiếp.');
    if(!this.available())throw Error('Chỉ nạp trên bản local có Arduino CLI và esptool.');
    this.starting=true;
    try{
      const request=validateFlashRequest(input,await SerialPort.list());
      this.job={id:randomUUID(),status:'running',phase:'prepare',message:'Chuẩn bị cổng USB',...request,startedAt:new Date().toISOString(),endedAt:null,logs:[],uploadPercent:null};
      this.persist();this.execute(request).catch(error=>{this.log(error.message);Object.assign(this.job,{status:'error',phase:'error',message:error.message,endedAt:new Date().toISOString()});this.persist();});
      return this.status();
    }finally{this.starting=false;}
  }
  async execute({port,deviceId,backupMode}){
    await this.onPrepare(deviceId);
    this.phase('release','Đóng gateway cũ của phòng đã chọn và gateway đang giữ cổng USB');await this.releaseGateway(port,deviceId);
    this.phase('detect','Nhận diện chip và Flash; giữ BOOT nếu board dừng ở Connecting');
    const chip=parseChip(await this.run(this.esptool,['--port',port,'flash-id']));Object.assign(this.job,chip);
    const config=this.configureToolchain();
    const fqbn=`esp32:esp32:esp32c5:FlashSize=${chip.flashMB}M,PSRAM=disabled,CDCOnBoot=cdc,PartitionScheme=${chip.flashMB>=8?'default_8MB':'default'}`;
    const sketch=path.join(this.root,'firmware/room_monitor'),build=path.join(this.dataDir,'build-firmware-web');fs.mkdirSync(build,{recursive:true});
    this.phase('compile','Biên dịch code đồ án và xác định chính xác vùng Flash sẽ ghi; PSRAM tắt');
    await this.run(this.cli,['--config-file',config,'compile','--fqbn',fqbn,'--build-path',build,sketch],600000);
    // Use the compiler's actual addresses, and only write these explicitly backed-up ranges.
    const {segments,affectedBytes}=readFlashPlan(build,chip.flashMB*1048576);
    if(affectedBytes>=chip.flashMB*1048576)throw Error('Kích thước firmware vượt Flash. Chưa ghi board.');
    const backupDir=path.join(this.dataDir,'backup');fs.mkdirSync(backupDir,{recursive:true});
    const filename=`${chip.chip}-${chip.mac.replaceAll(':','').slice(-6)}-${port}-${Date.now()}.bin`;
    const backup=path.join(backupDir,filename);this.job.backup=`backup/${filename}`;
    this.job.backupComplete=false;this.job.backupBytes=0;this.job.backupTotalBytes=backupMode==='full'?chip.flashMB*1048576:affectedBytes;
    this.job.backupOffset=0;this.job.backupScope=backupMode==='full'?'Toàn bộ Flash':'Vùng sẽ ghi + NVS (các vùng khác giữ nguyên)';
    this.phase('backup',`Sao lưu ${this.job.backupScope.toLowerCase()}; không rút cáp`);
    const partial=backup+'.partial',chunkFile=backup+'.chunk';
    const descriptor=fs.openSync(partial,'wx');
    try{
      let chunkSize=262144;
      for(let offset=0;offset<this.job.backupTotalBytes;){
        const size=Math.min(chunkSize,this.job.backupTotalBytes-offset);
        const args=['--chip','esp32c5','--port',port,'--baud','115200','read-flash','--no-progress',String(offset),String(size),chunkFile];
        let output;
        try{output=await this.run(this.esptool,args,90000);}
        catch(error){if(chunkSize<=65536)throw error;assertSameBoard(chip,parseChip(await this.run(this.esptool,['--port',port,'flash-id'])));chunkSize/=2;this.log(`Đọc Flash bị gián đoạn; giảm khối xuống ${chunkSize/1024} KB và thử lại phần chưa đọc.`);continue;}
        const identity=parseBoardIdentity(output);assertSameBoard(chip,{...identity,flashMB:chip.flashMB});
        const chunk=fs.readFileSync(chunkFile);if(chunk.length!==size)throw Error('Một phần sao lưu Flash chưa đủ dung lượng. Không ghi firmware.');
        fs.writeSync(descriptor,chunk);fs.unlinkSync(chunkFile);
        this.job.backupBytes=offset+chunk.length;this.job.message=`Đã sao lưu ${Math.round(this.job.backupBytes/1024)}/${this.job.backupTotalBytes/1024} KB (${this.job.backupScope}); không rút cáp`;this.persist();
        offset+=size;
      }
    }finally{fs.closeSync(descriptor);}
    fs.renameSync(partial,backup);
    if(fs.statSync(backup).size!==this.job.backupTotalBytes)throw Error('Bản sao lưu chưa đủ dung lượng. Không ghi firmware.');
    this.job.backupComplete=true;this.job.backupSha256=createHash('sha256').update(fs.readFileSync(backup)).digest('hex');this.persist();
    this.phase('verify-board','Kiểm tra lại MAC và Flash trước khi ghi');assertSameBoard(chip,parseChip(await this.run(this.esptool,['--port',port,'flash-id'])));
    this.phase('upload','Đang ghi firmware vào board; giữ nguyên cáp USB');
    await this.run(this.esptool,['--chip','esp32c5','--port',port,'--baud','460800','write-flash','--flash-mode','dio','--flash-freq','80m','--flash-size',`${chip.flashMB}MB`,...segments.flatMap(s=>['0x'+s.address.toString(16),s.file])],180000);
    this.phase('connect','Đã ghi firmware; đang kết nối gateway và chờ ACK thật từ board');
    const connectAfter=Date.now();await this.onConnected(deviceId);
    const gateway=spawn(process.execPath,[path.join(this.root,'gateway-usb.mjs'),port,deviceId],{cwd:this.root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:process.env});
    let gatewayError=null;gateway.on('error',error=>{gatewayError=error;});
    const jobId=this.job.id;
    gateway.stdout.on('data',data=>{if(this.job?.id===jobId)data.toString().split(/[\r\n]+/).forEach(line=>this.log(line));});
    gateway.stderr.on('data',data=>{if(this.job?.id===jobId)data.toString().split(/[\r\n]+/).forEach(line=>this.log(line));});
    const until=Date.now()+20000;
    while(Date.now()<until){if(gatewayError||gateway.exitCode!==null)break;if(this.isAcknowledged(deviceId,connectAfter)){Object.assign(this.job,{status:'success',phase:'done',message:`Đã nạp và kết nối ${deviceId} qua ${port}; nhận ACK, quạt/đèn/còi đang tắt.`,endedAt:new Date().toISOString()});this.persist();return;}await sleep(250);}
    throw Error('Đã ghi firmware nhưng chưa xác nhận ACK qua USB. Kiểm tra cổng/Serial Monitor; xem nhật ký gateway.');
  }
}
