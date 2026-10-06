import test from 'node:test';
import assert from 'node:assert/strict';
import {fitModel,residual,ransac,estimateTransform,project} from '../web/algorithms/geometry.mjs';

test('line TLS minimizes orthogonal distance and handles vertical lines',()=>{
  const m=fitModel([[3,0],[3,2],[3,4],[3,8]],'line');
  assert.ok(residual([3,7],m)<1e-10);assert.ok(Math.abs(residual([5,7],m)-2)<1e-10);
});
test('circle and rotated ellipse recover known geometric loci',()=>{
  const circle=Array.from({length:24},(_,i)=>{const t=i*Math.PI/12;return [30+10*Math.cos(t),40+10*Math.sin(t)];});
  const m=fitModel(circle,'circle');assert.ok(Math.abs(m.cx-30)<1e-6);assert.ok(Math.abs(m.radius-10)<1e-6);
  const ellipse=Array.from({length:36},(_,i)=>{const t=i*Math.PI/18,x=20*Math.cos(t),y=8*Math.sin(t),a=.4;return[50+x*Math.cos(a)-y*Math.sin(a),70+x*Math.sin(a)+y*Math.cos(a)];});
  const e=fitModel(ellipse,'ellipse');
  assert.ok(Math.abs(e.cx-50)<1e-6);assert.ok(Math.abs(e.cy-70)<1e-6);
  assert.ok(Math.abs(e.a-20)<1e-5);assert.ok(Math.abs(e.b-8)<1e-5);
  assert.ok(ellipse.every(p=>residual(p,e)<1e-5));
});
test('seeded RANSAC resists outliers and traces genuine sampled hypotheses',()=>{
  const points=Array.from({length:25},(_,i)=>[i,2*i+7]);
  points.push([1,100],[5,-80],[22,-50],[14,100]);
  const a=ransac(points,'line',{seed:11,threshold:.5,iterations:60});
  const b=ransac(points,'line',{seed:11,threshold:.5,iterations:60});
  assert.deepEqual(a,b);assert.equal(a.inliers.length,25);assert.ok(residual([10,27],a.model)<1e-8);
  assert.ok(a.trace.length>0&&a.trace[0].sample.length===2);
});
test('normalized homography reproduces correspondences and rejects near-collinear inputs',()=>{
  const from=[[0,0],[100,0],[100,80],[0,80]],to=[[10,20],[130,12],[115,95],[4,87]];
  const H=estimateTransform(from,to,'projective');
  for(let i=0;i<4;i++){const p=project(H,from[i]);assert.ok(Math.hypot(p[0]-to[i][0],p[1]-to[i][1])<1e-7);}
  assert.throws(()=>estimateTransform([[0,0],[1,1e-10],[2,2e-10],[3,3e-10]],to,'projective'),/退化|病态/);
  const scaled=from.map(p=>p.map(v=>v*10000));
  const H2=estimateTransform(scaled,to,'projective');
  assert.ok(Math.hypot(...project(H2,scaled[2]).map((v,j)=>v-to[2][j]))<1e-6);
});
test('rigid and affine models retain their distinct degrees of freedom',()=>{
  const from=[[0,0],[10,0],[0,10]],rigidTo=[[3,5],[3,15],[-7,5]];
  const rigid=estimateTransform(from,rigidTo,'rigid');
  assert.ok(Math.hypot(...project(rigid,[5,5]).map((v,j)=>v-[-2,10][j]))<1e-8);
  const affine=estimateTransform(from,[[1,2],[21,2],[6,32]],'affine');
  assert.ok(Math.hypot(...project(affine,[5,5]).map((v,j)=>v-[13.5,17][j]))<1e-8);
});
