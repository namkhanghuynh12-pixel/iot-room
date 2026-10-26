import test from 'node:test';
import assert from 'node:assert/strict';
import {splitInkSegments,chartGapLimit} from '../public/ui-state.js';
const point=(seconds,value=20,extra={})=>({at:new Date(seconds*1000).toISOString(),temperature:value,...extra});
test('brush paths and their fills split after three telemetry cycles',()=>{
  const rows=[point(0),point(3),point(6),point(30),point(33)];
  assert.equal(chartGapLimit(rows),9000);
  assert.deepEqual(splitInkSegments(rows,'temperature').map(s=>s.map(p=>p.time/1000)),[[0,3,6],[30,33]]);
});
test('missing values, reconnect, room change and reversed time cannot draw a bridge',()=>{
  for(const rows of [[point(0),point(3,null),point(6)],[point(0),point(3,21,{breakBefore:true})],[point(0,20,{device:'room1'}),point(3,20,{device:'room2'})],[point(3),point(0)]]){
    assert.equal(splitInkSegments(rows,'temperature').length,2);
  }
});
test('synthetic, measured and unknown provenance are distinct brush segments',()=>{
  const rows=[point(0,20,{synthetic:true}),point(3,21,{synthetic:true}),point(6,22,{synthetic:false}),point(9)];
  const segments=splitInkSegments(rows,'temperature');assert.deepEqual(segments.map(s=>s[0].synthetic),[true,false,null]);assert.equal(segments[0].length,2);
  assert.equal(rows[3].synthetic,undefined);
});
