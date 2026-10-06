import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMapping} from '../web/algorithms/source-mapping.mjs';

test('source mapping preserves actual rounded decode scales and pixel-center convention',()=>{
  const m=sourceMapping({w:640,h:360,originalWidth:1600,originalHeight:900});
  assert.deepEqual(m.original,{width:1600,height:900});
  assert.deepEqual(m.analysis,{width:640,height:360});
  assert.deepEqual(m.originalToAnalysis,[[.4,0,-.3],[0,.4,-.3],[0,0,1]]);
  assert.ok(!JSON.stringify(m).includes('pixels'));
});

test('second source mapping composes aspect-preserving fit and letterbox translation',()=>{
  const m=sourceMapping({w:640,h:320,originalWidth:1000,originalHeight:500},{width:640,height:360});
  assert.equal(m.originalToAnalysis[0][0],.64);
  assert.ok(Math.abs(m.originalToAnalysis[0][2]+.18)<1e-12);
  assert.ok(Math.abs(m.originalToAnalysis[1][2]-19.82)<1e-12);
  assert.deepEqual(m.fitOffset,[0,20]);
});
