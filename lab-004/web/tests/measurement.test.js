import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS, metresPerPixel } from '../js/contracts.js';
import { buildSampleMotion, measureMotions } from '../js/measurement.js';
import { dominantFrequency } from '../js/signal.js';
import { createState, reducer } from '../js/state.js';

test('shared contract exposes local measurement defaults',()=>{assert.equal(CONTRACTS.schemaVersion,'lab004.measurement.v1');assert.equal(CONTRACTS.defaultMethod,'template');assert.equal(CONTRACTS.minSamplesForSpectrum,128);});
test('scale conversion rejects short references and converts units',()=>{assert.equal(metresPerPixel([0,0],[160,0],100,'mm'),.000625);assert.throws(()=>metresPerPixel([0,0],[1,1],100,'mm'),e=>e.code==='INVALID_SCALE');});
test('sample returns displacement and frequency report',()=>{const result=measureMotions(buildSampleMotion(),{roi:{x:220,y:110,width:180,height:120},scale:{p1:[120,100],p2:[280,100],realDistance:100,unit:'mm'}});assert.equal(result.schemaVersion,'lab004.measurement.v1');assert.ok(result.displacement.samples.length>=128);assert.ok(Math.abs(result.spectrum.frequencyHz-2)<.1);});
test('signal rejects non-monotonic timestamps',()=>{assert.throws(()=>dominantFrequency([0,1,1],[0,1,0]),e=>e.code==='INSUFFICIENT_SAMPLES'||e.code==='FPS_UNSTABLE');});
test('state clears stale results when mode changes',()=>{let state=createState();state=reducer(state,{type:'RESULT',result:{}});state=reducer(state,{type:'SET_MODE',mode:'live'});assert.equal(state.result,null);});
