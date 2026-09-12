import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { validateSamples } from '../scripts/validate-samples.mjs';

test('sample release contains exactly three hashed licensed scene types', async () => {
  const webRoot = resolve(import.meta.dirname, '../web');
  const manifest = await validateSamples(webRoot);
  assert.equal(manifest.schema, 'lab007.samples.v1');
  assert.deepEqual(manifest.samples.map(sample => sample.id), ['indoor', 'street', 'person']);
  for (const sample of manifest.samples) {
    assert.match(sample.path, /^assets\/samples\/[a-z]+\.jpg$/);
    assert.ok(Number.isInteger(sample.width) && sample.width > 0);
    assert.ok(Number.isInteger(sample.height) && sample.height > 0);
    assert.match(sample.sha256, /^[a-f0-9]{64}$/);
    assert.ok(sample.source.title);
    assert.ok(sample.source.creator);
    assert.match(sample.source.url, /^https:\/\//);
    assert.ok(sample.source.license);
    assert.match(sample.source.licenseUrl, /^https:\/\//);
  }
});
