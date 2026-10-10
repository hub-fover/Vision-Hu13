import test from 'node:test';
import assert from 'node:assert/strict';
import {kmeansSteps,frameDifference,sparseFlow} from '../real/perception-core.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('pinned photo and OSS distributions match their published local manifest',()=>{
 const root=new URL('../real/assets/perception/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('metadata.json',root),'utf8'));
 for(const entry of manifest.assets)assert.equal(createHash('sha256').update(readFileSync(new URL(entry.file,root))).digest('hex'),entry.sha256,entry.file);
 assert.notEqual(manifest.assets.find(x=>x.file==='basketball1.png').sha256,manifest.assets.find(x=>x.file==='basketball2.png').sha256);
});
test('RGB clustering recovers separated colors and never increases objective',()=>{
 const rgba=new Uint8ClampedArray([0,0,0,255,5,5,5,255,250,250,250,255,255,255,255,255]);
 const steps=[...kmeansSteps(rgba,2,8)];
 assert.equal(new Set(steps.at(-1).labels).size,2);
 assert.equal(steps.at(-1).labels[0],steps.at(-1).labels[1]);
 assert.notEqual(steps.at(-1).labels[0],steps.at(-1).labels[3]);
 steps.forEach((s,i)=>{if(i)assert.ok(s.sse<=steps[i-1].sse+1e-7)});
});
test('vendored jsfeat LK measures a known textured translation',()=>{
 const context={module:{exports:{}},Uint8Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,Math};vm.createContext(context);vm.runInContext(readFileSync(new URL('../real/assets/perception/jsfeat.js',import.meta.url),'utf8'),context);
 const w=128,h=128,a=new Uint8ClampedArray(w*h*4),b=new Uint8ClampedArray(w*h*4);let state=44;for(let y=0;y<h;y++)for(let x=0;x<w;x++){state=(1664525*state+1013904223)>>>0;const v=state>>>24;for(let q=0;q<3;q++)a[(y*w+x)*4+q]=v;a[(y*w+x)*4+3]=255}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const xx=Math.max(0,x-2);for(let q=0;q<4;q++)b[(y*w+x)*4+q]=a[(y*w+xx)*4+q]}
 const result=sparseFlow(context.module.exports,a,b,w,h,{window:15,levels:3,iterations:30});assert.ok(result.tracked>10);const dx=result.tracks.filter(t=>t.valid).map(t=>t.nx-t.x).sort((a,b)=>a-b);assert.ok(Math.abs(dx[Math.floor(dx.length/2)]-2)<.4);
});
test('frame difference threshold uses measured pixel intensities',()=>{
 const a=new Uint8ClampedArray([10,10,10,255,200,200,200,255]);
 const b=new Uint8ClampedArray([40,40,40,255,205,205,205,255]);
 assert.deepEqual([...frameDifference(a,b,20).mask],[1,0]);
});
