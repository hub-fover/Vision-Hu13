import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleSpace,extremaCandidates,refineKeypoint,orientationHistogram,siftDescriptor,extractSIFT} from '../web/algorithms/sift.mjs';
test('Gaussian octaves preserve constant, DoG is zero and scale extrema absent',()=>{
  const pyramid=scaleSpace(new Float32Array(96*96).fill(80),96,96,{octaves:3,layers:3});
  assert.equal(pyramid.length,3);assert.equal(pyramid[1].w,48);
  for(const octave of pyramid){assert.equal(octave.gaussian.length,6);assert.equal(octave.dog.length,5);assert.ok(octave.gaussian.every(layer=>layer.every(v=>Math.abs(v-80)<1e-4)));assert.ok(octave.dog.every(layer=>layer.every(v=>Math.abs(v)<1e-4)));}
  assert.equal(extremaCandidates(pyramid,{contrast:1}).length,0);
});
test('3D Taylor refinement recovers known fractional extremum and rejects edge-like curvature',()=>{
  const w=17,h=17,dog=Array.from({length:5},(_,l)=>Float32Array.from({length:w*h},(_,i)=>30-(i%w-8.25)**2-2*(Math.floor(i/w)-8.1)**2-3*(l-2.2)**2));
  const o={w,h,dog,octave:0,layers:3,sigmas:[1.6,2,2.5,3.2,4]};
  const point=refineKeypoint(o,{x:8,y:8,layer:2},{contrast:1,edgeRatio:10});
  assert.ok(Math.abs(point.x-8.25)<1e-5);assert.ok(Math.abs(point.y-8.1)<1e-5);assert.ok(Math.abs(point.scaleLayer-2.2)<1e-5);
  const edge={...o,dog:Array.from({length:5},(_,l)=>Float32Array.from({length:w*h},(_,i)=>30-.01*(i%w-8.25)**2-2*(Math.floor(i/w)-8.1)**2-3*(l-2.2)**2))};
  assert.equal(refineKeypoint(edge,{x:8,y:8,layer:2},{contrast:1,edgeRatio:10}),null);
});
test('DoG compares all 26 space-scale neighbours and finds Gaussian blob scale',()=>{
  const w=96,h=96,input=Float32Array.from({length:w*h},(_,i)=>20+210*Math.exp(-((i%w-48)**2+(Math.floor(i/w)-48)**2)/18));
  const pyramid=scaleSpace(input,w,h,{octaves:3,layers:3});
  const candidates=extremaCandidates(pyramid,{contrast:1});
  assert.ok(candidates.some(p=>Math.hypot(p.x*2**p.octave-48,p.y*2**p.octave-48)<2));
  for(const p of candidates){const o=pyramid[p.octave],value=o.dog[p.layer][p.y*o.w+p.x];for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dz&&!dy&&!dx)continue;const other=o.dog[p.layer+dz][(p.y+dy)*o.w+p.x+dx];assert.ok(value>0?value>other:value<other);}}
});
test('orientation assignment and 128d descriptor normalize rotated gradients and additive brightness',()=>{
  const w=80,h=80,xRamp=Float32Array.from({length:w*h},(_,i)=>i%w),yRamp=Float32Array.from({length:w*h},(_,i)=>Math.floor(i/w));
  const p={x:40,y:40,sigma:2};
  const horizontal=orientationHistogram(xRamp,w,h,p),vertical=orientationHistogram(yRamp,w,h,p);
  assert.equal(horizontal.histogram.length,36);assert.ok(Math.abs(horizontal.angles[0])<.01);assert.ok(Math.abs(vertical.angles[0]-Math.PI/2)<.01);
  const a=siftDescriptor(xRamp,w,h,{...p,angle:0}),b=siftDescriptor(yRamp,w,h,{...p,angle:Math.PI/2});
  assert.equal(a.length,128);assert.ok(Math.abs(Math.hypot(...a)-1)<1e-6);
  assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<.03);
  const offset=siftDescriptor(Float32Array.from(xRamp,v=>v+40),w,h,{...p,angle:0});assert.deepEqual(offset,a);
});
test('end to end SIFT returns located scale extrema with real 128d descriptors, not ORB keypoints',()=>{
  const w=128,h=128,input=Float32Array.from({length:w*h},(_,i)=>{
    const x=i%w,y=Math.floor(i/w);return 20+180*Math.exp(-((x-40.3)**2+(y-50.2)**2)/18)+150*Math.exp(-((x-86.1)**2+(y-77.4)**2)/50);
  });
  const result=extractSIFT(input,w,h,{contrast:1});
  assert.ok(result.keypoints.length>0);assert.ok(result.candidates.length>=result.refined.length);
  assert.ok(result.keypoints.some(p=>Math.hypot(p.imageX-40.3,p.imageY-50.2)<1));
  for(const p of result.keypoints){assert.equal(p.descriptor.length,128);assert.equal(p.histogram.length,36);assert.ok(Number.isFinite(p.angle));assert.ok(Math.abs(Math.hypot(...p.descriptor)-1)<1e-5);}
  assert.equal(extractSIFT(new Float32Array(w*h).fill(80),w,h).keypoints.length,0);
});
