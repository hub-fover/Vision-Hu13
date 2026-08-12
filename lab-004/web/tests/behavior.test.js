import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState, reducer, MODES } from '../js/state.js';
import { updateTracking } from '../js/tracking.js';
import { calibrationReady, exportCalibration, importCalibration } from '../js/calibration.js';
import { ERROR_MESSAGES } from '../js/contracts.js';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('mode changes and bad tracking clear stale numeric results immediately', () => {
  let state=createState(); state=reducer(state,{type:'RESULT',result:{perpendicularDistanceM:1}});
  state=reducer(state,{type:'SET_MODE',mode:MODES.LIVE}); assert.equal(state.result,null);
  state=reducer(state,{type:'TRACK_INIT'}); state=reducer(state,{type:'TRACK_GOOD',result:{perpendicularDistanceM:2}});
  state=reducer(state,{type:'TRACK_BAD'}); assert.equal(state.result,null);
});
test('three consecutive bad frames produce tracking lost', () => {let s={status:'tracking',badFrames:0};for(let i=0;i<3;i++)s=updateTracking(s,{trackedFeatures:0,homographyInlierRatio:0,medianForwardBackwardErrorPx:9});assert.equal(s.status,'tracking-lost');});
test('calibration requires eight views and JSON is versioned', () => {assert.equal(calibrationReady(Array(7)),false);assert.equal(calibrationReady(Array(8)),true);assert.equal(importCalibration(exportCalibration({intrinsics:{}})).schema,'lab004.camera-intrinsics.v1');});
test('actionable errors cover camera, loss, cancellation and missing runtime',()=>{for(const code of ['BUILD_PREREQUISITE','PERMISSION_DENIED','UNSUPPORTED_CAMERA','TRACKING_LOST','CANCELLED'])assert.ok(ERROR_MESSAGES[code]);});
test('worker uses a lazy same-origin import and typed protocol',async()=>{const value=await source('../js/camera-pose.worker.js');assert.match(value,/import\('\.\.\/vendor\/opencv\.js'\)/);for(const type of ['load','estimate','calibrateQuick','calibrateEnhanced','initTrack','updateTrack','cancel'])assert.ok(value.includes(type));assert.doesNotMatch(value,/https?:\/\//);});
test('UI has mobile capture and no persistence, upload, telemetry, or remote runtime',async()=>{const value=(await Promise.all(['../index.html','../js/app.js','../js/worker-client.js'].map(source))).join('\n');assert.match(value,/accept="image\/\*" capture="environment"/);assert.doesNotMatch(value,/localStorage|sessionStorage|indexedDB|XMLHttpRequest|sendBeacon|fetch\(['\"]https?:/);});
test('Three is local-vendored and disposes GPU resources',async()=>{const value=await source('../js/frustum-view.js');assert.match(value,/\.\.\/vendor\/three\.module\.js/);assert.match(value,/geometry\?\.dispose/);assert.match(value,/renderer\.dispose/);});
test('worker client exposes cancellation and pending-request cleanup',async()=>{const value=await source('../js/worker-client.js');assert.match(value,/cancel\(id\)/);assert.match(value,/pending\.clear/);assert.match(value,/worker\.terminate/);});
