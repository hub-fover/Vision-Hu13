import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { validateRuntime, vendorRuntime } from '../scripts/vendor-runtime.mjs';

test('vendorRuntime creates a deterministic same-origin browser runtime', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'lab007-runtime-'));
  try {
    const dependencyRoot = resolve(import.meta.dirname, '../web');
    const result = await vendorRuntime({ webRoot: temporary, dependencyRoot });
    assert.equal(result.schema, 'lab007.runtime.v1');
    assert.deepEqual(result.packages, {
      transformers: '4.2.0',
      onnxruntimeWeb: '1.26.0-dev.20260416-b7804b056c',
      lucide: '1.45.0',
      qrcode: '1.5.4',
    });
    assert.deepEqual(result.files.map(file => file.path), [
      'licenses/lucide.txt',
      'licenses/onnxruntime-web.txt',
      'licenses/qrcode.txt',
      'licenses/transformers.txt',
      'lucide.min.js',
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'qrcode.min.js',
      'transformers.web.min.js',
    ]);
    assert.ok(result.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
    assert.ok(result.files.reduce((total, file) => total + file.bytes, 0) < 45 * 1024 * 1024);
    const transformers = await readFile(join(temporary, 'vendor/transformers.web.min.js'), 'utf8');
    assert.doesNotMatch(transformers, /(?:from|import\()["'](?:onnxruntime(?:-web)?|@huggingface)\//);
    assert.deepEqual(await validateRuntime(temporary), result);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
