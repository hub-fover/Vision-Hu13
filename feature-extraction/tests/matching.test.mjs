import test from 'node:test';
import assert from 'node:assert/strict';
import {matchDescriptors,verifyMatches} from '../web/algorithms/matching.mjs';
test('nonfinite ratio is rejected instead of silently removing all matches',()=>{
  for(const ratio of [NaN,Infinity,-Infinity])assert.throws(()=>matchDescriptors([[1,0]],[[1,0],[0,1]],{ratio}),/参数/);
});
test('ratio and mutual tests remove ambiguous and nonreciprocal Euclidean matches',()=>{
  const a=[[0,0],[.1,0],[10,0]],b=[[0,0],[2,0],[10,0]];
  const r=matchDescriptors(a,b,{ratio:.75});
  assert.equal(r.nearest.length,3);assert.equal(r.ratio.length,3);assert.equal(r.mutual.length,2);
  assert.deepEqual(r.mutual.map(m=>[m.query,m.train]),[[0,0],[2,2]]);
  const ambiguous=matchDescriptors([[0,0]],[[-1,0],[1,0]],{ratio:.9});assert.equal(ambiguous.ratio.length,0);
  const duplicates=matchDescriptors([[0,0]],[[0,0],[0,0]],{ratio:.9});assert.equal(duplicates.ratio.length,0);
});
test('geometric RANSAC recovers known transform, rejects false pairs and is reproducible',()=>{
  const a=Array.from({length:20},(_,i)=>[20+(i%5)*40,20+Math.floor(i/5)*35]);
  const b=a.map(([x,y])=>[x*1.1+8,y*.9+12]);b[4]=[10,180];b[11]=[220,25];b[18]=[15,15];
  const matches=a.map((_,i)=>({query:i,train:i}));
  const r=verifyMatches(a,b,matches,{seed:42,threshold:1,iterations:120});
  assert.equal(r.inliers.length,17);assert.ok(r.medianError<1e-7);assert.deepEqual(r,verifyMatches(a,b,matches,{seed:42,threshold:1,iterations:120}));
  assert.throws(()=>verifyMatches(a,b,matches.slice(0,3)),/不足/);
});
