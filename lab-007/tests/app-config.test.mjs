import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_CONFIG } from '../web/config.js';

test('public configuration keeps metric depth disabled and pins the canonical URL', () => {
  assert.deepEqual(APP_CONFIG, {
    metricApiBase: '',
    canonicalUrl: 'https://hub-fover.github.io/Vision-Hu13/lab-007/',
  });
});
