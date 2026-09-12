import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateSamples } from './validate-samples.mjs';
import { validateRuntime, vendorRuntime } from './vendor-runtime.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const labRoot = resolve(scriptDir, '..');
const source = resolve(labRoot, 'web');
const defaultDestination = resolve(scriptDir, '../../web/lab-007');
const excluded = new Set(['node_modules', 'package.json', 'package-lock.json', '.gitignore', 'test-results', 'vendor']);
const required = [
  'LICENSES.md', 'THIRD_PARTY_NOTICES.md', 'assets/samples/SOURCES.md',
  'index.html', 'styles.css', 'config.js', 'js/app.js', 'js/canvas-renderer.js',
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
    try {
      if (!(await stat(resolve(root, path))).isFile()) throw new Error();
    } catch {
      throw new Error(`missing staged asset: ${path}`);
    }
  }
  const samples = await validateSamples(root);
  const runtime = await validateRuntime(root);
  const files = await listFiles(root);
  if (files.some(path => path.split('/').includes('node_modules') || path === 'package.json' || path === 'package-lock.json')) {
    throw new Error('development dependencies leaked into LAB 007 Pages staging');
  }
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  if (/<script[^>]+src=["']https?:\/\//i.test(html) || /<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i.test(html)) {
    throw new Error('remote runtime reference in index.html');
  }
  if (/(?:src|href)=["']\/(?!\/)/i.test(html)) throw new Error('root-absolute resource in index.html');
  if (!/viewport-fit=cover/i.test(html)) throw new Error('index.html must respect safe-area viewports');
  if (!/<input[^>]+type=["']file["'][^>]+capture=["']environment["']/i.test(html)) throw new Error('index.html must expose a rear-camera input');
  for (const reference of ['./vendor/lucide.min.js', './vendor/qrcode.min.js']) {
    if (!html.includes(reference)) throw new Error(`missing same-origin runtime reference: ${reference}`);
  }
  const worker = await readFile(resolve(root, 'js/depth.worker.js'), 'utf8');
  if (!worker.includes("from '../vendor/transformers.web.min.js'")) throw new Error('Depth Worker must import same-origin Transformers.js');
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
