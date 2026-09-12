import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { stagePages } from '../scripts/stage-pages.mjs';

test('stagePages creates a validated static tree without development dependencies', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'lab007-pages-'));
  const destination = join(temporary, 'lab-007');
  try {
    const report = await stagePages(destination);
    assert.equal(report.sampleCount, 3);
    assert.equal(report.runtimeCount, 11);
    assert.ok(report.files.includes('vendor/transformers.web.min.js'));
    assert.ok(report.files.includes('vendor/ort-wasm-simd-threaded.wasm'));
    assert.ok(report.files.includes('assets/samples/person.jpg'));
    assert.ok(report.files.includes('assets/samples/SOURCES.md'));
    assert.ok(report.files.includes('LICENSES.md'));
    assert.ok(report.files.includes('THIRD_PARTY_NOTICES.md'));
    assert.ok(!report.files.some(path => path.includes('node_modules')));
    assert.ok(!report.files.includes('package.json'));
    assert.ok(!report.files.includes('package-lock.json'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
