import test from 'node:test';
import assert from 'node:assert/strict';
import {transferBuffers} from '../web/algorithms/transfer.mjs';
test('worker transfer deduplicates shared arrays and preserves values through real structured transfer',()=>{
  const image=new Float32Array([3,7,11]),hist=new Float64Array([2,4]),payload={image,stages:[{data:image},{data:image.subarray(1)}],hist};
  const buffers=transferBuffers(payload);assert.equal(buffers.length,2);
  const received=structuredClone(payload,{transfer:buffers});assert.equal(image.byteLength,0);
  assert.deepEqual([...received.image],[3,7,11]);assert.equal(received.stages[0].data.buffer,received.image.buffer);assert.deepEqual([...received.stages[1].data],[7,11]);
});
