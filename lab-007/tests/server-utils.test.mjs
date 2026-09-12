import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { resolveStaticPath } from '../scripts/server-utils.mjs';

test('resolveStaticPath keeps decoded requests inside the static root', () => {
  const root = resolve('lab-007/web');
  assert.equal(resolveStaticPath(root, '/assets/samples/indoor.jpg'), resolve(root, 'assets/samples/indoor.jpg'));
  assert.equal(resolveStaticPath(root, '/'), resolve(root, 'index.html'));
  assert.throws(() => resolveStaticPath(root, '/../package.json'), /unsafe path/);
  assert.throws(() => resolveStaticPath(root, '/%2e%2e/package.json'), /unsafe path/);
});
