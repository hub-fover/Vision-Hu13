import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeParams,checkResult} from '../runtime.mjs';
for(const chapter of ['004','005','006','007','008']){
 const {scenes}=await import(`../chapters/ch${chapter}.mjs`);
 for(const scene of scenes){
  test(`${chapter}/${scene.id}: defaults pass real output contract`,()=>{
   const params=normalizeParams(scene.controls,{}),r=checkResult(scene.compute({params,seed:2026}));
   assert.equal(r.views.length,3);assert.ok(r.stages.length>=2);assert.ok(r.metrics.length>=1);
   assert.ok(scene.steps.length>=3);assert.ok(scene.questions.length>=2);assert.match(scene.source.file,/\.pptx$/);
   for(const v of [...r.views,...r.stages.flatMap(s=>s.views)]){
    assert.ok(['heatmap','surface','matrix','scatter','curves','bars'].includes(v.kind));
    if(v.data)assert.equal(v.data.length,v.width*v.height);
   }
   assert.deepEqual(scene.compute({params,seed:2026}).numeric,r.numeric);
  });
 }
}
