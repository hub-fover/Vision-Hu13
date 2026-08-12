import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(await readFile(resolve(root, 'shared/contracts.json'), 'utf8'));
const js = await import('../web/js/contracts.js');
assert.deepEqual(js.CORNER_ORDER, contract.cornerOrder);
assert.equal(js.CONTRACTS.analysisMaxSide, contract.analysisMaxSide);
assert.equal(js.CONTRACTS.trackingDefaults.targetAnalysisFps, contract.trackingDefaults.targetAnalysisFps);
assert.equal(js.CONTRACTS.trackingDefaults.maxTrackedFeatures, contract.trackingDefaults.maxTrackedFeatures);
console.log('LAB 004 cross-runtime contract: PASS');
