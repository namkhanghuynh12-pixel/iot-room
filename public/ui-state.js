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
