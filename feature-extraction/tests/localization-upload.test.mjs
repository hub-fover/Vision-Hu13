import test from 'node:test';
import assert from 'node:assert/strict';
import {runGeometric} from '../web/scenes/geometric.mjs';

test('uploaded localization stages show uploaded samples, never synthetic ground-truth curve',()=>{
  const input=Float32Array.from({length:64*32},(_,i)=>30+120*Math.exp(-((i%64-20.5)**2)/8));
  const output=runGeometric({scene:'05',w:64,h:32,input,seed:42,options:{preset:'spot',phase:31.4,width:2,'sample-noise':5,background:30,trials:8}});
  const line=output.result.stages[0].overlays[0].points;
  assert.equal(line.length,64);
  assert.ok(Math.abs(line[20][1]-(2-input[20]/255*(-28)))<1e-5);
  assert.equal(output.result.simulated.truth,null);
  assert.equal(output.result.repeats,null);
  assert.doesNotMatch(output.result.observation,/(?:误差|真值)\s*[-\d]/);
});
