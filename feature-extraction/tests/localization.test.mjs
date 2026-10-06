import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateProfile,fitProfile,repeatLocalization,houghLines,houghCircles} from '../web/algorithms/localization.mjs';

test('Gaussian center and blurred edge inflection recover subpixel ground truth independently',()=>{
  for(const type of ['spot','edge']) for(const phase of [.1,.4,.8]) {
    const data=simulateProfile({type,center:31+phase,sigma:2.3,noise:0,background:35,amplitude:140});
    const fit=fitProfile(data.values,type);
    assert.ok(Math.abs(fit.center-(31+phase))<.002);
    assert.ok(Math.abs(fit.sigma-2.3)<.01);
  }
});
test('repeated trials are reproducible and report measured variance rather than preset precision',()=>{
  const opts={type:'spot',center:31.4,sigma:2,noise:5,seed:7,trials:20};
  const a=repeatLocalization(opts),b=repeatLocalization(opts);
  assert.deepEqual(a,b);assert.ok(a.std>0);assert.ok(Math.abs(a.bias)<.2);assert.equal(a.success,20);
  assert.throws(()=>fitProfile(new Float32Array(64).fill(50),'spot'),/平坦|对比度/);
});
test('Hough peak recovers known horizontal line despite a gap and noise',()=>{
  const points=[];for(let x=8;x<100;x++)if(x<35||x>55)points.push([x,40]);
  points.push([10,7],[80,80],[22,65]);
  const r=houghLines(points,120,100,{thetaBins:180,rhoStep:1});
  assert.ok(Math.abs(r.peaks[0].theta-Math.PI/2)<.02);
  assert.ok(Math.abs(r.peaks[0].rho-40)<1.1);
  assert.ok(r.peaks[0].votes>60);
});
test('gradient-constrained circle voting identifies center and reduces candidate count',()=>{
  const points=[],angles=[];
  for(let i=0;i<80;i++){const a=i*2*Math.PI/80;points.push([60+25*Math.cos(a),50+25*Math.sin(a)]);angles.push(a);}
  const result=houghCircles(points,angles,120,100,{radius:25,step:2,gradientConstraint:true});
  assert.ok(Math.hypot(result.center[0]-60,result.center[1]-50)<3);
  assert.equal(result.candidateVotes,160);
});
