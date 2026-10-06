import test from 'node:test';
import assert from 'node:assert/strict';
import {runMatchingScene,matchingScene} from '../web/scenes/matching.mjs';

test('zero matches with known transform do not falsely claim missing ground truth',()=>{
  const options={...Object.fromEntries(matchingScene.controls.map(c=>[c.id,c.value])),preset:'repeat'};
  const result=runMatchingScene({w:480,h:300,options}).result;
  assert.ok(result.truth);assert.equal(result.matches.mutual.length,0);assert.equal(result.truthRate,null);
  assert.match(result.metrics,/有.*真值.*无匹配/);
  assert.doesNotMatch(result.metrics,/没有对应真值/);
  const pixels=new Float32Array(64*64).fill(80);
  const independent=runMatchingScene({w:64,h:64,input:pixels,input2:pixels,options}).result;
  assert.equal(independent.truth,null);assert.match(independent.metrics,/没有对应真值/);
});
