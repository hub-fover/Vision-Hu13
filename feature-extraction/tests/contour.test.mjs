import test from 'node:test';
import assert from 'node:assert/strict';
import {resampleContour} from '../web/algorithms/contour.mjs';
test('drawn square closes and resamples uniformly rather than following event density',()=>{
  const points=resampleContour([[10,10],[12,10],[20,10],[20,20],[10,20],[10,10]],8);
  assert.deepEqual(points,[[10,10],[15,10],[20,10],[20,15],[20,20],[15,20],[10,20],[10,15]]);
});
test('tiny, collinear and crossing contours are rejected with explanatory feedback',()=>{
  assert.throws(()=>resampleContour([[10,10],[10,10],[10,10]]),/轮廓/);
  assert.throws(()=>resampleContour([[10,10],[20,10],[30,10],[40,10]]),/面积/);
  assert.throws(()=>resampleContour([[10,10],[30,30],[10,30],[30,10]]),/交叉|面积/);
});
