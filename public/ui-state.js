// Pure UI contracts. No transport changes: commandId is device.lastCommand.
export function matchesCommandAck(pending, device) {
  return Boolean(pending && pending.commandId && device?.online &&
    device.id === pending.deviceId && device.lastCommand === pending.commandId &&
    device.acknowledged === true && device[pending.type] === pending.targetValue);
}

export function arcPath(from, to, max = 100) {
  const point = v => {
    const angle = Math.PI * (1 - Math.max(0, Math.min(v / max, 1)));
    return `${(100 + 75 * Math.cos(angle)).toFixed(3)} ${(95 - 75 * Math.sin(angle)).toFixed(3)}`;
  };
  return `M ${point(from)} A 75 75 0 0 1 ${point(to)}`;
}

export function shouldReduceVideo(before, after) {
  const frames = after.totalVideoFrames - before.totalVideoFrames;
  return frames >= 60 && (after.droppedVideoFrames - before.droppedVideoFrames) / frames > 0.3;
}

// Keep time/source discontinuities out of every brush layer, including the fill.
export function chartGapLimit(data, fallbackMs=3000){
  const intervals=[];
  for(let i=1;i<data.length;i++){
    const dt=Date.parse(data[i].at)-Date.parse(data[i-1].at);
    if(dt>0&&dt<=15000)intervals.push(dt);
  }
  intervals.sort((a,b)=>a-b);
  return 3*Math.max(1000,intervals.length?intervals[Math.floor(intervals.length/2)]:fallbackMs);
}
export function splitInkSegments(data,key,gapMs=chartGapLimit(data)){
  const result=[];let segment=[],previous=null;
  const flush=()=>{if(segment.length)result.push(segment);segment=[];};
  for(const row of data){
    const time=Date.parse(row.at),value=row[key];
    if(!Number.isFinite(time)||typeof value!=='number'||!Number.isFinite(value)){flush();previous=null;continue;}
    const synthetic=row.synthetic===true?true:row.synthetic===false?false:null;
    if(previous&&(row.breakBefore||time<=previous.time||time-previous.time>gapMs||synthetic!==previous.synthetic||(row.device&&previous.row.device&&row.device!==previous.row.device)))flush();
    const point={row,time,value,synthetic};segment.push(point);previous=point;
  }
  flush();return result;
}
