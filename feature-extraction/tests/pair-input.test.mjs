import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPairImage} from '../web/algorithms/pair-input.mjs';
test('second image preserves aspect ratio in first-image analysis coordinates with explicit mapping',()=>{
  const input=Float32Array.from({length:8},(_,i)=>i*10),result=fitPairImage(input,4,2,8,8);
  assert.equal(result.scale,2);assert.deepEqual(result.offset,[0,2]);assert.equal(result.pixels.length,64);
  assert.equal(result.pixels[0],20);assert.equal(result.pixels[2*8],0);assert.equal(result.pixels[2*8+6],30);
  assert.throws(()=>fitPairImage(input,5,2,8,8),/尺寸/);
});
