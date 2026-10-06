import test from 'node:test';
import assert from 'node:assert/strict';
import {runMatchingScene} from '../web/scenes/matching.mjs';
test('matching scene computes SIFT correspondences and real layered filtering with known truth',()=>{
  const job={w:240,h:180,options:{preset:'texture','match-ratio':.8,'match-threshold':3}};
  const output=runMatchingScene(job),r=output.result;
  assert.match(r.legend,/蓝.*内点/);assert.match(r.legend,/橙.*外点/);assert.match(r.legend,/候选/);
  assert.ok(r.matches.nearest.length>0);assert.ok(r.matches.ratio.length<=r.matches.nearest.length);assert.ok(r.matches.mutual.length<=r.matches.ratio.length);
  assert.equal(r.stages.length,4);assert.equal(typeof r.truthRate,'number');assert.ok(r.geometry.inliers.length>=4);
});
