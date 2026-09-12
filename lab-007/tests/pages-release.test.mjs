import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { stagePages, validatePagesStage } from '../scripts/stage-pages.mjs';

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

test('validatePagesStage rejects a staged tree without the application entry point', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'lab007-pages-missing-'));
  const destination = join(temporary, 'lab-007');
  try {
    await stagePages(destination);
    await unlink(join(destination, 'index.html'));
    await assert.rejects(validatePagesStage(destination), /missing staged asset: index\.html/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('validatePagesStage rejects remote browser runtime scripts', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'lab007-pages-remote-'));
  const destination = join(temporary, 'lab-007');
  try {
    await stagePages(destination);
    const indexPath = join(destination, 'index.html');
    const html = await readFile(indexPath, 'utf8');
    await writeFile(indexPath, html.replace('./vendor/lucide.min.js', 'https://cdn.example/lucide.min.js'));
    await assert.rejects(validatePagesStage(destination), /remote runtime reference/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
