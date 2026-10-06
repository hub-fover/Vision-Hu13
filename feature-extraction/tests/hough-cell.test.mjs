import test from 'node:test';
import assert from 'node:assert/strict';
import {selectHoughCell} from '../web/algorithms/localization.mjs';

test('热图点击对应实际显示的格子，右下边界不越界',()=>{
  const line={thetaBins:4,rhoBins:5,rhoStep:2,extent:4};
  const peak=selectHoughCell(line,100,80,[39,39]).selectedPeak;
  assert.equal(peak.theta,Math.PI/4);
  assert.equal(peak.rho,0);
  const end=selectHoughCell(line,100,80,[100,80]).selectedPeak;
  assert.equal(end.theta,3*Math.PI/4);
  assert.equal(end.rho,4);
  const circle={cols:4,rows:5,step:2};
  assert.deepEqual(selectHoughCell(circle,100,80,[39,39]).selectedCenter,[2,4]);
  assert.deepEqual(selectHoughCell(circle,100,80,[100,80]).selectedCenter,[6,8]);
});
