import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeParams,validateInput,checkResult,toPortable} from '../runtime.mjs';

test('parameters have finite defaults, clamp safely and reject nonfinite input',()=>{
 const controls=[{key:'noise',min:0,max:1,step:.1,value:.2}];
 assert.deepEqual(normalizeParams(controls,{}),{noise:.2});
 assert.equal(normalizeParams(controls,{noise:8}).noise,1);
 assert.throws(()=>normalizeParams(controls,{noise:NaN}),/有限/);
});
test('uploaded pixels reject wrong shapes and out of range values',()=>{
 assert.throws(()=>validateInput({width:64,height:64,data:[1]}),/尺寸/);
 assert.throws(()=>validateInput({width:1,height:1,data:[2]}),/像素/);
 assert.deepEqual(validateInput({width:2,height:1,data:[0,1]}).data,[0,1]);
});
test('portable export retains typed numeric values without object index encoding',()=>{
 assert.deepEqual(toPortable({x:Float32Array.of(.5,1)}),{x:[.5,1]});
});
test('nonfinite algorithm output never reaches the display',()=>{
 assert.throws(()=>checkResult({views:[],stages:[],metrics:[]}),/三个/);
 const v={kind:'bars',title:'x',values:[1]};
 assert.throws(()=>checkResult({views:[v,v,v],stages:[{label:'a',views:[v,v,v]}],metrics:[{label:'m',value:Infinity}]}),/有限/);
});
