import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS, metresPerPixel } from '../js/contracts.js';
import { buildSampleFrames, buildSampleMotion, measureMotions } from '../js/measurement.js';
import { createState, reducer } from '../js/state.js';

test('static-scene contract is versioned and flow-only', () => { assert.equal(CONTRACTS.schemaVersion, 'lab004.static-scene-speed.v2'); assert.equal(CONTRACTS.defaultMethod, 'flow'); });
test('scale conversion enforces measured reference', () => { assert.equal(metresPerPixel([0, 0], [100, 0], 1, 'm'), .01); assert.throws(() => metresPerPixel([0, 0], [2, 2], 1, 'm'), (e) => e.code === 'INVALID_SCALE'); });
test('deterministic sample returns speed report', () => { const result = measureMotions(buildSampleMotion(120, 30), { roi: { x: 160, y: 90, width: 320, height: 180 }, scale: { p1: [80, 300], p2: [280, 300], realDistance: 1, unit: 'm' }, fps: 30 }); assert.equal(result.schemaVersion, CONTRACTS.schemaVersion); assert.ok(result.velocityMps > 0); assert.ok(result.validRatio > .9); assert.ok(Array.isArray(result.samples)); });
test('sample frames expose static scene canvases', () => { const frames = buildSampleFrames(4, 30); assert.equal(frames.length, 4); assert.equal(frames[0].canvas.width, 640); assert.equal(frames[0].canvas.height, 360); });
test('state clears stale result when mode changes or reset', () => { let state = createState(); state = reducer(state, { type: 'RESULT', result: { velocityMps: 1 } }); state = reducer(state, { type: 'SET_MODE', mode: 'live' }); assert.equal(state.result, null); state = reducer(state, { type: 'SET_FRAMES', frames: [{}, {}] }); state = reducer(state, { type: 'CLEAR' }); assert.deepEqual(state.frames, []); });
test('three tracking failures enter lost state and clear measurement', () => { let state = createState(); state = reducer(state, { type: 'RESULT', result: { velocityMps: 1 } }); state = reducer(state, { type: 'TRACK_BAD' }); state = reducer(state, { type: 'TRACK_BAD' }); state = reducer(state, { type: 'TRACK_BAD' }); assert.equal(state.status, 'tracking-lost'); assert.equal(state.result, null); });
