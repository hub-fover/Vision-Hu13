import test from 'node:test';
import assert from 'node:assert/strict';
import { blur, gradient, laplacian, hysteresis, canny, analyzeEdges, generateSample } from '../web/algorithms/edges.mjs';

test('reflect Gaussian preserves constant and normalized Sobel/Scharr recover a ramp', () => {
  const w=17,h=13, constant=new Float32Array(w*h).fill(65);
  assert.ok(blur(constant,w,h,1.6).every(v => Math.abs(v-65)<1e-4));
  const ramp=Float32Array.from({length:w*h},(_,i)=>2*(i%w)+3*Math.floor(i/w));
  for(const method of ['sobel','scharr']) {
    const g=gradient(ramp,w,h,method), index=6*w+8;
    assert.equal(g.gx[index],2); assert.equal(g.gy[index],3);
    assert.ok(Math.abs(g.magnitude[index]-Math.sqrt(13))<1e-6);
  }
  assert.ok(laplacian(constant,w,h).every(v=>v===0));
});
test('hysteresis keeps 8-connected weak edges, excludes isolated weak pixels', () => {
  const nms=new Float32Array(7*5);
  nms[8]=80; nms[16]=35; nms[17]=35; nms[26]=35;
  const result=hysteresis(nms,7,5,20,60);
  assert.equal(result.edges[8],255); assert.equal(result.edges[16],255);
  assert.equal(result.edges[17],255); assert.equal(result.edges[26],0);
  assert.equal(result.retainedWeak,2); assert.equal(result.removedWeak,1);
});
test('Canny constant is empty; thresholds suppress actual step and order is enforced', () => {
  const w=40,h=24, step=Float32Array.from({length:w*h},(_,i)=>(i%w<20?20:220));
  assert.equal(canny(new Float32Array(w*h).fill(50),w,h,{sigma:1,low:10,high:20}).edgeCount,0);
  const normal=canny(step,w,h,{sigma:1,low:5,high:20});
  assert.ok(normal.edgeCount>=20);
  assert.equal(canny(step,w,h,{sigma:1,low:180,high:200}).edgeCount,0);
  assert.throws(()=>canny(step,w,h,{sigma:1,low:40,high:20}),/threshold/);
  assert.equal(normal.stages.length,7);
});
test('edge analysis retains physical profile and fixed noise while smoothing reduces noise derivative', () => {
  const w=80,h=48, input=generateSample('step',w,h,12,8);
  assert.deepEqual(input,generateSample('step',w,h,12,8));
  assert.notDeepEqual(input,generateSample('step',w,h,12,9));
  // The middle row crosses the sinusoidal boundary at x=40.
  const a=analyzeEdges(input,w,h,{sigma:0,row:24,method:'sobel'});
  const b=analyzeEdges(input,w,h,{sigma:2,row:24,method:'sobel'});
  assert.equal(a.profile.gray.length,w);
  const roughness=x=>x.profile.first.slice(2,25).reduce((s,v)=>s+v*v,0);
  assert.ok(roughness(b)<roughness(a));
  assert.ok(b.profile.peaks.some(x=>Math.abs(x-40)<4));
  assert.ok(b.profile.zeroCrossings.some(x=>Math.abs(x-40)<4));
});
test('floating point round-off on a noiseless roof is not reported as dozens of edges', () => {
  const image=generateSample('roof',480,300,0,42);
  const result=analyzeEdges(image,480,300,{sigma:1.2,row:75});
  assert.ok(result.profile.zeroCrossings.length<6);
});
