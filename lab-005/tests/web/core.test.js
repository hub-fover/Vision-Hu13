import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPeak, estimateDepth } from '../../web/js/depth.js';
import { fitScale, validateCalibration } from '../../web/js/calibration.js';
import { checkAlignment } from '../../web/js/alignment.js';
import { createInitialState, readyFrames } from '../../web/js/state.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');

test('focus peak is fitted between frames', () => assert.ok(Math.abs(fitPeak([1, 4, 3, 1, 0]) - 1.2) < 0.15));
test('relative depth selects a peak and confidence map', () => {
  const gray = Float32Array.from({ length: 64 }, (_, i) => (i % 8) / 8); const frames = [0, 1, 2, 3, 4].map(index => ({ width: 8, height: 8, gray: gray.map(value => value * (index === 2 ? 2 : 1)) }));
  const result = estimateDepth(frames, { tileSize: 8, minTexture: 0, minPeakProminence: 0 }); assert.equal(result.depth.length, 1); assert.equal(result.confidence.length, 1);
});
test('alignment rejects a moved stack', () => assert.throws(() => checkAlignment([{ width: 10, height: 10, meanX: 0, meanY: 0 }, { width: 10, height: 10, meanX: 0, meanY: 0 }, { width: 10, height: 10, meanX: 0, meanY: 0 }, { width: 10, height: 10, meanX: 0, meanY: 0 }, { width: 10, height: 10, meanX: 30, meanY: 0 }]), error => error.code === 'CAMERA_MOVED'));
test('scale mapping is versioned and monotonic', () => { const scale = fitScale([0.8, 0.2, 0.5], [1, 0.3, 0.6]); assert.equal(scale.schema, 'lab005.focus-depth-scale.v1'); assert.deepEqual(scale.samples.map(item => item.focus), [0.2, 0.5, 0.8]); });
test('calibration import validates schema', () => assert.throws(() => validateCalibration({ schema: 'wrong', intrinsics: {} }), error => error.code === 'INTRINSICS_MISMATCH'));
test('initial state has five empty capture slots', () => { const state = createInitialState(); assert.equal(state.frames.length, 5); assert.equal(readyFrames(state), false); });
test('web app stays local-only and exposes five capture positions', () => { const html = readFileSync(join(ROOT, 'web/index.html'), 'utf8'); assert.match(html, /capture="environment"/); const source = readFileSync(join(ROOT, 'web/js/app.js'), 'utf8'); assert.doesNotMatch(source, /fetch\(['"]https?:|navigator\.sendBeacon|localStorage|indexedDB|document\.cookie/); });
