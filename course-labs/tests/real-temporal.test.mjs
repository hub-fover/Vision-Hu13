import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAnalyzer,components} from '../real/temporal-core.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx={};ctx.window=ctx;vm.runInNewContext(readFileSync(new URL('../real/assets/perception/jsfeat.js',import.meta.url),'utf8'),ctx);
const solid=(w,h,v,time=0)=>({width:w,height:h,time,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:v)});
test('EMA adapts to stationary change while frame difference disappears immediately',()=>{
 const a=createAnalyzer(null,{mode:'background',threshold:10,alpha:.5,minArea:1,freeze:false,clean:false});
 a.push(solid(8,8,0));let r=a.push(solid(8,8,100,1));assert.equal(r.metrics.foreground,64);assert.equal(r.metrics.changed,64);
 for(let i=2;i<7;i++)r=a.push(solid(8,8,100,i));assert.equal(r.metrics.changed,0);assert.equal(r.metrics.foreground,0);
});
test('foreground exclusion keeps stationary subject separate from background',()=>{
 const a=createAnalyzer(null,{mode:'background',threshold:10,alpha:.5,minArea:1,freeze:true,clean:false});a.push(solid(8,8,0));
 let r;for(let i=1;i<8;i++)r=a.push(solid(8,8,100,i));assert.equal(r.metrics.foreground,64);assert.equal(r.metrics.changed,0);
});
test('connected components exclude speckles and return real pixel bounds',()=>{
 const mask=new Uint8Array(25);mask[0]=1;for(const i of [12,13,17,18])mask[i]=1;
 assert.deepEqual(components(mask,5,5,3),[{x:2,y:2,width:2,height:2,area:4}]);
});
test('persistent LK tracks known translation and keeps feature IDs over three frames',()=>{
 const w=128,h=96;let state=123;const gray=Uint8Array.from({length:w*h},()=>{state=(1664525*state+1013904223)>>>0;return state>>>24});
 const frame=(shift,time)=>({width:w,height:h,time,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>{if(i%4===3)return 255;const p=i>>2,x=p%w,y=Math.floor(p/w);return x>=shift?gray[y*w+x-shift]:0})});
 const a=createAnalyzer(ctx.jsfeat,{mode:'flow',window:15,levels:3,fb:1.5,reseed:false});a.push(frame(0,0));const r=a.push(frame(2,.2)),s=a.push(frame(4,.4));
 assert.ok(r.metrics.active>10);assert.ok(Math.abs(r.metrics.medianDx-2)<.3);assert.ok(s.tracks.some(t=>t.history.length===3));assert.ok(s.tracks.every(t=>r.tracks.some(u=>u.id===t.id)));
});
test('sequence rejects changed dimensions and nonmonotonic time',()=>{
 const a=createAnalyzer(null,{mode:'background'});a.push(solid(8,8,0));assert.throws(()=>a.push(solid(9,8,0,1)),/尺寸/);assert.throws(()=>a.push(solid(8,8,0,0)),/时间/);
});
