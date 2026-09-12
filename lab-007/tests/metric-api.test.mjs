import test from 'node:test';
import assert from 'node:assert/strict';

import { metricDepthAvailable, validateMetricResponse } from '../web/js/metric-api.js';

test('metricDepthAvailable accepts only absolute HTTP endpoints', () => {
  assert.equal(metricDepthAvailable(''), false);
  assert.equal(metricDepthAvailable('/depth'), false);
  assert.equal(metricDepthAvailable('https://example.com'), true);
  assert.equal(metricDepthAvailable('http://127.0.0.1:8001'), true);
  assert.equal(metricDepthAvailable('javascript:alert(1)'), false);
});

test('validateMetricResponse returns finite metre data with matching dimensions', () => {
  const payload = { width: 2, height: 2, depth: [1, 2, 3, 4], unit: 'm', model: 'Depth Pro' };
  assert.deepEqual(validateMetricResponse(payload), payload);
  assert.throws(() => validateMetricResponse({ ...payload, unit: 'relative' }), /unit/);
  assert.throws(() => validateMetricResponse({ ...payload, depth: [1, 2] }), /length/);
  assert.throws(() => validateMetricResponse({ ...payload, depth: [1, -1, 3, 4] }), /values/);
});
