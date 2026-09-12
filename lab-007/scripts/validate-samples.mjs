import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultWebRoot = resolve(scriptDir, '../web');
const sceneIds = ['indoor', 'street', 'person'];
const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(data) {
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error('sample is not a JPEG');
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (sofMarkers.has(marker)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += length + 2;
  }
  throw new Error('sample JPEG dimensions are unavailable');
}

function assertSource(source, id) {
  if (!source || typeof source !== 'object') throw new Error(`missing sample source: ${id}`);
  for (const field of ['title', 'creator', 'url', 'license', 'licenseUrl']) {
    if (typeof source[field] !== 'string' || !source[field].trim()) throw new Error(`missing sample source ${field}: ${id}`);
  }
  for (const field of ['url', 'licenseUrl']) {
    if (new URL(source[field]).protocol !== 'https:') throw new Error(`sample source ${field} must use HTTPS: ${id}`);
  }
}

export async function validateSamples(webRoot = defaultWebRoot) {
  const root = resolve(webRoot);
  const manifest = JSON.parse(await readFile(resolve(root, 'assets/samples/manifest.json'), 'utf8'));
  if (manifest.schema !== 'lab007.samples.v1') throw new Error('unexpected LAB 007 sample schema');
  if (!Array.isArray(manifest.samples) || manifest.samples.length !== sceneIds.length) throw new Error('LAB 007 requires exactly three samples');
  if (manifest.samples.map(sample => sample.id).join(',') !== sceneIds.join(',')) throw new Error('LAB 007 sample types must be indoor, street, person');

  for (const sample of manifest.samples) {
    const target = resolve(root, sample.path || '');
    const insideRoot = relative(resolve(root, 'assets/samples'), target);
    if (!insideRoot || insideRoot.startsWith('..') || resolve(target) === resolve(root, 'assets/samples')) throw new Error(`unsafe sample path: ${sample.path}`);
    const data = await readFile(target);
    const digest = createHash('sha256').update(data).digest('hex');
    if (digest !== sample.sha256) throw new Error(`sample hash mismatch: ${sample.path}`);
    const dimensions = jpegSize(data);
    if (dimensions.width !== sample.width || dimensions.height !== sample.height) throw new Error(`sample dimensions mismatch: ${sample.path}`);
    assertSource(sample.source, sample.id);
  }
  return manifest;
}

async function main() {
  const manifest = await validateSamples(process.argv[2] ? resolve(process.argv[2]) : defaultWebRoot);
  process.stdout.write(`LAB 007 samples: PASS (${manifest.samples.length} licensed images)\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
