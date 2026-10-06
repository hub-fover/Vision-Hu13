import test from 'node:test';
import assert from 'node:assert/strict';
import {runSiftScene} from '../web/scenes/sift.mjs';
test('SIFT scene stages share computed scale-space and selected descriptor statistics',()=>{
  const job={w:160,h:120,options:{preset:'blobs','sift-angle':0,'sift-scale':1,'sift-brightness':1,'sift-blur':0,'sift-contrast':1}};
  const output=runSiftScene(job),r=output.result;
  assert.match(r.legend,/蓝.*关键点/);assert.match(r.legend,/橙.*选中/);assert.match(r.legend,/DoG/);
  assert.ok(r.keypoints.length>0);assert.ok(r.stages.some(s=>s.name.includes('DoG')));assert.ok(r.stages.some(s=>s.name.includes('128')));
  assert.equal(r.selected.descriptor.length,128);
  const other=runSiftScene({...job,selectedKeypoint:r.keypoints.length-1});assert.deepEqual(other.result.selected,r.keypoints.at(-1));
  const flat=runSiftScene({...job,options:{...job.options,preset:'flat'}});assert.match(flat.result.observation,/没有/);assert.equal(flat.result.keypoints.length,0);
});
test('scale-space stages retain native octave sizes rather than full-canvas copies',()=>{
  const w=256,h=192,r=runSiftScene({w,h,options:{preset:'flat','sift-angle':0,'sift-scale':1,'sift-brightness':1,'sift-blur':0,'sift-contrast':2}}).result;
  const layers=r.stages.filter(s=>/Gaussian|DoG/.test(s.name));
  assert.ok(layers.reduce((n,s)=>n+s.data.length,0)<16*w*h);
  const second=layers.find(s=>s.name.startsWith('Gaussian octave 1'));
  assert.equal(second.fieldWidth,128);assert.equal(second.fieldHeight,96);assert.equal(second.data.length,128*96);
});
