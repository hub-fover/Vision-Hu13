import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS, metresPerPixel } from '../js/contracts.js';
import { buildSampleFrames, buildSampleMotion, measureMotions } from '../js/measurement.js';
import { dominantFrequency } from '../js/signal.js';
import { createState, reducer } from '../js/state.js';
import { captureLiveFrames, motionFromFrames } from '../js/capture.js';

test('shared contract exposes local measurement defaults',()=>{assert.equal(CONTRACTS.schemaVersion,'lab004.measurement.v1');assert.equal(CONTRACTS.defaultMethod,'template');assert.equal(CONTRACTS.minSamplesForSpectrum,128);});
test('scale conversion rejects short references and converts units',()=>{assert.equal(metresPerPixel([0,0],[160,0],100,'mm'),.000625);assert.throws(()=>metresPerPixel([0,0],[1,1],100,'mm'),e=>e.code==='INVALID_SCALE');});
test('sample returns displacement and frequency report',()=>{const result=measureMotions(buildSampleMotion(),{roi:{x:220,y:110,width:180,height:120},scale:{p1:[120,100],p2:[280,100],realDistance:100,unit:'mm'}});assert.equal(result.schemaVersion,'lab004.measurement.v1');assert.ok(result.displacement.samples.length>=128);assert.ok(Math.abs(result.spectrum.frequencyHz-2)<.1);});
test('rendered sample frame metadata is relative to the first frame',()=>{const frames=buildSampleFrames(16,30);assert.equal(frames[0].offsetX,0);assert.equal(frames[0].offsetY,0);assert.ok(Math.abs(frames[1].offsetX)>0);assert.ok(Math.abs(frames[1].offsetY)>0);});
test('signal rejects non-monotonic timestamps',()=>{assert.throws(()=>dominantFrequency([0,1,1],[0,1,0]),e=>e.code==='INSUFFICIENT_SAMPLES'||e.code==='FPS_UNSTABLE');});
test('state clears stale results when mode changes',()=>{let state=createState();state=reducer(state,{type:'RESULT',result:{}});state=reducer(state,{type:'SET_MODE',mode:'live'});assert.equal(state.result,null);});
test('editing inputs invalidates a previous result and mode switches clear frames',()=>{let state=createState();state=reducer(state,{type:'SET_FRAMES',frames:[{},{}]});state=reducer(state,{type:'RESULT',result:{}});state=reducer(state,{type:'SET_SCALE',scale:{realDistance:200}});assert.equal(state.result,null);state=reducer(state,{type:'SET_MODE',mode:'live'});assert.deepEqual(state.frames,[]);});
test('live capture helper is available for the camera path',()=>{assert.equal(typeof captureLiveFrames,'function');});
test('frame timestamps are preserved by pixel tracking',()=>{const makeCanvas=()=>({width:64,height:64,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(64*64*4)})})});const motions=motionFromFrames([{canvas:makeCanvas(),timeS:.4},{canvas:makeCanvas(),timeS:.9}],{x:0,y:0,width:64,height:64},30);assert.equal(motions[0].timeS,.4);assert.equal(motions[1].timeS,.9);});
test('imported frame timestamps survive tracking',()=>{const frames=buildSampleMotion(128,24).map((frame,index)=>({...frame,timeS:index/24}));const result=measureMotions(frames,{roi:{x:220,y:110,width:180,height:120},scale:{p1:[120,100],p2:[280,100],realDistance:100,unit:'mm'},fps:24});assert.equal(result.diagnostics.fps,24);assert.equal(result.displacement.samples[10].timeS,10/24);});
