import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(await readFile(resolve(root, 'shared/contracts.json'), 'utf8'));
const js = await import('../web/js/contracts.js');
assert.equal(js.CONTRACTS.schemaVersion, contract.schemaVersion);
assert.equal(js.CONTRACTS.analysisMaxSide, contract.analysisMaxSide);
assert.equal(js.CONTRACTS.targetAnalysisFps, contract.targetAnalysisFps);
assert.equal(js.CONTRACTS.minTemplateScore, contract.minTemplateScore);
assert.deepEqual(js.FREQUENCY_BAND_HZ, contract.frequencyBandHz);
console.log('LAB 004 cross-runtime contract: PASS');
