// Send only over local Serial; never log or persist this credential frame.
export function sendWifiConfiguration(serial,frame,{timeoutMs=15000,retryMs=1000,settleMs=800}={}){
  return new Promise((resolve,reject)=>{
    let buffer='',retry,settle,timer,done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(settle);clearInterval(retry);serial.removeListener('data',data);serial.removeListener('error',failed);error?reject(error):resolve();};
    const failed=()=>finish(Error('Kết nối USB gián đoạn; cấu hình chưa được xác nhận.'));
    const data=chunk=>{
      buffer+=chunk.toString();if(buffer.length>16384)buffer='';let end;
      while((end=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
        let ack;try{ack=JSON.parse(line);}catch{continue;}
        if(ack.type==='provisionAck')finish(ack.ok===true?null:Error('ESP32 từ chối cấu hình Wi-Fi.'));
      }
    };
    const write=()=>{if(done)return;serial.write(JSON.stringify(frame)+'\n',error=>{if(error)finish(Error('Không gửi được cấu hình qua USB.'));});};
    serial.on('data',data);serial.on('error',failed);
    timer=setTimeout(()=>finish(Error('ESP32 chưa xác nhận lưu Wi-Fi. Kiểm tra đúng cổng COM, firmware và USB CDC/UART.')),timeoutMs);
    serial.set({dtr:true,rts:false},error=>{
      if(done)return;if(error)return finish(Error('Không thiết lập được đường truyền USB.'));
      settle=setTimeout(()=>{write();if(!done)retry=setInterval(write,retryMs);},settleMs);
    });
  });
}
