import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateSamples } from './validate-samples.mjs';
import { validateRuntime, vendorRuntime } from './vendor-runtime.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const labRoot = resolve(scriptDir, '..');
const source = resolve(labRoot, 'web');
const defaultDestination = resolve(scriptDir, '../../web/lab-007');
const excluded = new Set(['node_modules', 'package.json', 'package-lock.json', 'test-results', 'vendor']);
const required = [
  'LICENSES.md', 'THIRD_PARTY_NOTICES.md', 'assets/samples/SOURCES.md',
  'js/depth-engine.js', 'js/depth-utils.js', 'js/depth.worker.js', 'js/image-utils.js',
  'js/metric-api.js', 'js/model-config.js', 'js/share-card.js', 'js/ui-state.js',
  'js/worker-controller.js', 'js/worker-core.js', 'assets/samples/manifest.json',
];

async function listFiles(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    if (entry.isFile()) result.push(relative(root, path).split(sep).join('/'));
  }
  return result.sort();
}

function safeDestination(destination) {
  const target = resolve(destination);
  const temporary = relative(resolve(tmpdir()), target);
  if (target !== defaultDestination && (temporary === '' || temporary.startsWith('..') || isAbsolute(temporary))) {
    throw new Error(`unsafe LAB 007 staging destination: ${target}`);
  }
  return target;
}

export async function validatePagesStage(destination = defaultDestination) {
  const root = resolve(destination);
  for (const path of required) {
    if (!(await stat(resolve(root, path))).isFile()) throw new Error(`missing staged asset: ${path}`);
  }
  const samples = await validateSamples(root);
  const runtime = await validateRuntime(root);
  const files = await listFiles(root);
  if (files.some(path => path.split('/').includes('node_modules') || path === 'package.json' || path === 'package-lock.json')) {
    throw new Error('development dependencies leaked into LAB 007 Pages staging');
  }
  return { files, sampleCount: samples.samples.length, runtimeCount: runtime.files.length };
}

export async function stagePages(destination = defaultDestination) {
  const target = safeDestination(destination);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: path => path === source || !excluded.has(path.split(/[\\/]/).at(-1)),
  });
  await vendorRuntime({ webRoot: target, dependencyRoot: source });
  return validatePagesStage(target);
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args[0] === '--validate-only';
  const destination = resolve(scriptDir, args[validateOnly ? 1 : 0] || '../../web/lab-007');
  const report = validateOnly ? await validatePagesStage(destination) : await stagePages(destination);
  process.stdout.write(`LAB 007 Pages: PASS (${report.files.length} files, ${report.sampleCount} samples, ${report.runtimeCount} runtime files)\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
