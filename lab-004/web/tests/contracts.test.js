import test from 'node:test';
import assert from 'node:assert/strict';
import { CORNER_ORDER, CONTRACTS, buildObjectPoints, estimateUncalibratedIntrinsics } from '../js/contracts.js';
import { validateQuad } from '../js/quad-editor.js';

test('contract constants and object points match Python frame', () => {
  assert.deepEqual(CORNER_ORDER, ['TL','TR','BR','BL']);
  assert.deepEqual(buildObjectPoints(2, 1), [[-1,.5,0],[1,.5,0],[1,-.5,0],[-1,-.5,0]]);
  assert.equal(CONTRACTS.analysisMaxSide, 1280);
});
test('uncalibrated intrinsics use focal fallback and valid image size', () => {
  const k = estimateUncalibratedIntrinsics(1000, 500);
  assert.equal(k.source, 'estimated');
  assert.equal(k.cameraMatrix[0][0], 1000);
  assert.equal(k.cameraMatrix[1][1], 1000);
});
test('quad validation rejects clipped and accepts canonical rectangle', () => {
  assert.deepEqual(validateQuad([[100,50],[500,50],[500,350],[100,350]], 800, 600), [[100,50],[500,50],[500,350],[100,350]]);
  assert.throws(() => validateQuad([[0,0],[500,0],[500,300],[0,300]], 800, 600), e => e.code === 'TARGET_CLIPPED');
});
