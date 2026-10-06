import test from 'node:test';
import assert from 'node:assert/strict';
import {runGeometric,geometricScenes} from '../web/scenes/geometric.mjs';

test('localization statistics expose noisy undersampling rather than promising universal subpixel accuracy',()=>{
  const defaults=Object.fromEntries(geometricScenes['05'].controls.map(c=>[c.id,c.value]));
  const run=(preset,width,noise)=>runGeometric({scene:'05',w:480,h:300,seed:42,options:{...defaults,preset,width,'sample-noise':noise}}).result;
  for(const preset of ['spot','edge'])for(const width of [.4,2,12]){
    const clean=run(preset,width,0);
    assert.ok(Math.abs(clean.fit.center-31.4)<.002);
    assert.ok(clean.repeats.std<1e-8);
  }
  const narrow=run('spot',.4,40),moderate=run('spot',2,40),wide=run('edge',12,40);
  assert.ok(Math.abs(narrow.fit.center-31.4)>10);
  assert.ok(narrow.repeats.std>10);
  assert.ok(moderate.repeats.std<1);
  assert.ok(wide.repeats.std>3);
  for(const r of [narrow,moderate,wide]){
    const errors=r.repeats.errors,mean=errors.reduce((a,b)=>a+b,0)/errors.length;
    const std=Math.sqrt(errors.reduce((s,e)=>s+(e-mean)**2,0)/(errors.length-1));
    assert.ok(Math.abs(mean-r.repeats.bias)<1e-10);
    assert.ok(Math.abs(std-r.repeats.std)<1e-10);
    assert.equal(r.repeats.success,errors.length);
    assert.equal(r.repeats.success+r.repeats.failed,32);
  }
});
