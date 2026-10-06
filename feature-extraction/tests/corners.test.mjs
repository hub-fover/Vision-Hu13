import test from 'node:test';
import assert from 'node:assert/strict';
import {structureTensor,detectCorners,windowSSD,transformImage} from '../web/algorithms/corners.mjs';
import {runGeometric} from '../web/scenes/geometric.mjs';

const w=65,h=65;
function image(fn){return Float32Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w)));}
test('constant window has zero tensor eigenvalues and no corners',()=>{
  const pixels=image(()=>80),t=structureTensor(pixels,w,h,{sigma:1});
  assert.equal(t.small[32*w+32],0);assert.equal(t.large[32*w+32],0);
  assert.equal(detectCorners(t,w,h).points.length,0);
});
test('straight edge constrains only its normal while a corner constrains both axes',()=>{
  const edge=structureTensor(image(x=>x<32?0:200),w,h,{sigma:2});
  const corner=structureTensor(image((x,y)=>x>=32&&y>=32?200:0),w,h,{sigma:2});
  const i=32*w+32;
  assert.ok(edge.large[i]>100);assert.ok(edge.small[i]<1e-6);
  assert.ok(corner.small[i]>100);assert.ok(corner.harris[i]>0);
  const detection=detectCorners(corner,w,h,{threshold:.1,radius:4});
  assert.ok(detection.candidates.length>detection.points.length);
  assert.ok(detection.points.some(p=>Math.hypot(p[0]-32,p[1]-32)<3));
  for(let a=0;a<detection.points.length;a++)for(let b=a+1;b<detection.points.length;b++)assert.ok(Math.hypot(...detection.points[a].map((v,k)=>v-detection.points[b][k]))>4);
});
test('actual SSD surface on a linear ramp follows displacement squared, not a fabricated tensor heatmap',()=>{
  const pixels=image((x,y)=>2*x+3*y);
  const surface=windowSSD(pixels,w,h,[32,32],3,2);
  assert.equal(surface.values[2*5+2],0);
  assert.equal(surface.values[2*5+3],49*4);
  assert.equal(surface.values[3*5+2],49*9);
  assert.equal(surface.values[3*5+3],49*25);
});
test('corner scene returns measured local eigenvalues and selectable SSD stages',()=>{
  const options={preset:'corner','tensor-sigma':2,'corner-threshold':.05,'corner-method':'shi'};
  const output=runGeometric({scene:'03',w:120,h:100,options});
  assert.ok(output.result.tensor.small[50*120+60]>0);
  assert.ok(output.result.stages.length>=3);
  assert.ok(output.result.resultStage.overlays[0].points.length>0);
  const flat=runGeometric({scene:'03',w:120,h:100,options:{...options,preset:'flat'}});
  assert.equal(flat.result.detection.points.length,0);
});
test('centered rotation and scaling use inverse bilinear sampling and a known forward transform',()=>{
  const pixels=image((x,y)=>x+2*y);
  const identity=transformImage(pixels,w,h,{angle:0,scale:1});
  assert.deepEqual(identity.pixels,pixels);
  const rotated=transformImage(pixels,w,h,{angle:90,scale:1});
  assert.equal(rotated.pixels[32*w+40],pixels[24*w+32]);
  assert.deepEqual(rotated.map([40,32]).map(Math.round),[32,40]);
  const scaled=transformImage(pixels,w,h,{angle:0,scale:2});
  assert.equal(scaled.pixels[32*w+40],pixels[32*w+36]);
  assert.throws(()=>transformImage(pixels,w,h,{scale:0}),/尺度/);
});
test('corner scene reruns detection after rotation and measures only valid interior correspondences',()=>{
  const result=runGeometric({scene:'03',w:120,h:100,options:{preset:'corner','tensor-sigma':2,'corner-threshold':.05,'corner-method':'shi','corner-angle':30,'corner-scale':.8}}).result;
  assert.ok(result.comparison.expected.length>0);
  assert.ok(result.comparison.detected.length>0);
  assert.ok(result.comparison.matched>0);
  assert.ok(result.comparison.meanDistance<4);
  assert.notDeepEqual(result.resultStage.data,result.stages[2].data);
});
import * as sceneModule from '../web/scenes/geometric.mjs';
test('实验菜单按编号排序，而非对象键枚举顺序',()=>{
  assert.equal(typeof sceneModule.orderedSceneEntries,'function');
  const entries=sceneModule.orderedSceneEntries(sceneModule.geometricScenes);
  assert.deepEqual(entries.map(([id])=>id),['03','04','05','06','07','08','09','10']);
  assert.equal(entries.find(([id])=>id==='08')[1].title,'SIFT 怎样应对尺度和旋转');
});
