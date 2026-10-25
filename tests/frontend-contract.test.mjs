import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { matchesCommandAck, arcPath, shouldReduceVideo } from '../public/ui-state.js';

test('ACK cannot confirm a previous command, another device, or unconfirmed output', () => {
  const pending = { type:'fan', deviceId:'sim-room-01', commandId:'new-command', targetValue:true };
  const device = { id:'sim-room-01', online:true, lastCommand:'new-command', acknowledged:true, fan:true };
  assert.equal(matchesCommandAck(pending,device),true);
  for (const patch of [{id:'sim-room-02'}, {lastCommand:'old-command'}, {acknowledged:false}, {fan:false}, {online:false}]) {
    assert.equal(matchesCommandAck(pending,{...device,...patch}),false);
  }
  assert.equal(matchesCommandAck({...pending,commandId:null},device),false);
});

test('gauge boundaries use numerical thresholds, not hand-drawn approximations', () => {
  assert.equal(arcPath(0,30,60),'M 25.000 95.000 A 75 75 0 0 1 100.000 20.000');
  assert.notEqual(arcPath(28,30,60),arcPath(28,35,60));
});

test('video quality reduces only after enough frames and more than 30% drops', () => {
  const baseline = {totalVideoFrames:100,droppedVideoFrames:10};
  assert.equal(shouldReduceVideo(baseline,{totalVideoFrames:200,droppedVideoFrames:41}),true);
  assert.equal(shouldReduceVideo(baseline,{totalVideoFrames:200,droppedVideoFrames:40}),false);
  assert.equal(shouldReduceVideo(baseline,{totalVideoFrames:110,droppedVideoFrames:19}),false);
});

test('anime text colors meet AA against the worst video behind translucent cards', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8').split('/* ANIME ROOM')[1];
  const blocks = [...css.matchAll(/:root(?:\[data-theme="light"\])?\s*\{([^}]+)\}/g)];
  const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16));
  const luminance = c => c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for (const [index,block] of blocks.entries()) {
    const tokens = Object.fromEntries([...block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
    const [r,g,b,a] = tokens['--gx-glass-bg'].match(/[\d.]+/g).map(Number);
    const bg = [r,g,b].map(v=>v*a+(index===0?255:0)*(1-a));
    for (const key of ['--gx-text-primary','--gx-text-secondary','--gx-text-muted','--gx-accent-glow','--gx-status-danger','--gx-status-warn','--gx-status-ok']) {
      const l1 = luminance(rgb(tokens[key])), l2 = luminance(bg);
      assert.ok((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)>=4.5,`${key}: theme ${index} does not meet 4.5:1`);
    }
  }
  assert.equal(blocks.length,2);
});

test('offline cache serves ranged media without caching or replaying API calls', async () => {
  const handlers = {};
  const scope = vm.createContext({
    self:{location:{origin:'http://room.test'},addEventListener:(name,handler)=>{handlers[name]=handler;}},
    caches:{match:async()=>new Response(new Uint8Array([1,2,3,4,5,6]),{headers:{'Content-Type':'video/mp4'}})},
    URL, Response, Request, fetch
  });
  vm.runInContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),scope);
  scope.request = new Request('http://room.test/bg.mp4',{headers:{Range:'bytes=1-3'}});
  let response = await vm.runInContext('offlineAsset(request)',scope);
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 1-3/6');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2,3,4]);
  scope.request = new Request('http://room.test/bg.mp4',{headers:{Range:'bytes=99-'}});
  response = await vm.runInContext('offlineAsset(request)',scope);assert.equal(response.status,416);
  handlers.fetch({request:new Request('http://room.test/api/status'),respondWith:()=>assert.fail('API must not use cached snapshots')});
  handlers.fetch({request:new Request('http://room.test/api/settings',{method:'POST'}),respondWith:()=>assert.fail('Commands must not be cached/replayed')});
});
