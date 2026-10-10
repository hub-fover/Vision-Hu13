import test from 'node:test';
import assert from 'node:assert/strict';
import { stereoMatch, pointCosts } from '../real/geometry-core.mjs';
test('rectified translated texture recovers known disparity with valid interior confidence',()=>{
 const w=48,h=24,d=5,left=new Uint8Array(w*h),right=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)left[y*w+x]=(x*37+y*71+x*y*13)%251;
 for(let y=0;y<h;y++)for(let x=0;x<w-d;x++)right[y*w+x]=left[y*w+x+d];
 const r=stereoMatch(left,right,w,h,{maxDisparity:10,block:5,uniqueness:.1});
 assert.equal(r.disparity[12*w+25],d);assert.equal(r.valid[12*w+25],1);assert.ok(r.confidence[12*w+25]>.9);
 assert.equal(r.valid[0],0);assert.equal(pointCosts(left,right,w,h,25,12,10,5)[d],0);
});
test('textureless tie stays invalid; candidate never samples outside image',()=>{
 const a=new Uint8Array(40*20).fill(20),r=stereoMatch(a,a,40,20,{maxDisparity:8,block:3,uniqueness:.05});
 assert.equal(r.valid.reduce((s,v)=>s+v,0),0);assert.equal(pointCosts(a,a,40,20,2,10,8,3)[4],Infinity);
});
test('bad inputs fail explicitly',()=>{assert.throws(()=>stereoMatch([],[],8,8,{block:4}),/block|shape/);});
test('integral SAD agrees with brute force costs across a noisy pair',()=>{
 const w=29,h=19,a=Uint8Array.from({length:w*h},(_,i)=>(i*17+i*i*7)%256),b=Uint8Array.from(a,v=>(v*3+2)%256);
 const r=stereoMatch(a,b,w,h,{maxDisparity:6,block:5,uniqueness:0});
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const costs=pointCosts(a,b,w,h,x,y,6,5),v=Math.min(...costs);assert.ok(Math.abs(r.cost[y*w+x]-v)<1e-5);assert.ok(Math.abs(costs[r.disparity[y*w+x]]-v)<1e-5);}
});
