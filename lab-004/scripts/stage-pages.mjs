import { cp, mkdir, readdir, rm, stat, readFile } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../web');
const assetSource = resolve(here, '../assets');
const defaultDestination = resolve(here, '../../web/lab-004');
const excluded = new Set(['node_modules', 'package.json', 'package-lock.json', 'playwright.config.js', 'scripts', 'tests', 'test-results', 'README.md', 'manifest.local.json', '_review-manifest.json']);
const required = [
  'index.html', 'styles.css', 'assets/samples/manifest.json',
  'js/app.js', 'js/state.js', 'js/capture.js', 'js/editor.js', 'js/measurement.js', 'js/template.js',
  'js/flow.js', 'js/signal.js', 'js/worker-client.js', 'js/measurement.worker.js', 'js/errors.js'
];

async function listFiles(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join('/'));
  }
  return result;
}

async function validatePagesStage(destination = defaultDestination) {
  const root = resolve(destination);
  const missing = [];
  for (const path of required) {
    try { if (!(await stat(resolve(root, path))).isFile()) throw new Error(); }
    catch { missing.push(path); }
  }
  if (missing.length) throw new Error(missing.map(path => `missing staged asset: ${path}`).join('\n'));
  const files = await listFiles(root);
  for (const path of files.filter(p => p.endsWith('.html') || p.startsWith('js/'))) {
    const content = await readFile(resolve(root, path), 'utf8');
    if (/https?:\/\//i.test(content)) throw new Error(`remote runtime reference in ${path}`);
    if (/(?:src|href)=["']\/(?!\/)/i.test(content)) throw new Error(`root-absolute resource in ${path}`);
  }
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  if (/<script[^>]+opencv\.js/i.test(html)) throw new Error('OpenCV.js must remain Worker-lazy-loaded');
  const manifest = JSON.parse(await readFile(resolve(root, 'assets/samples/manifest.json'), 'utf8'));
  if (!(manifest.sampleId || (Array.isArray(manifest.samples) && manifest.samples.length))) throw new Error('sample manifest is empty');
  return { files };
}

async function stagePages(destination = defaultDestination) {
  const target = resolve(destination);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, filter: path => path === source || !excluded.has(path.split(/[\\/]/).at(-1)) });
  await mkdir(resolve(target, 'assets/samples'), { recursive: true });
  await cp(resolve(assetSource, 'samples/manifest.json'), resolve(target, 'assets/samples/manifest.json'));
  const manifest = JSON.parse(await readFile(resolve(assetSource, 'samples/manifest.json'), 'utf8'));
  for (const sample of manifest.samples || []) {
    if (!sample.path) continue;
    const sourcePath = resolve(assetSource, 'samples', sample.path);
    const destinationPath = resolve(target, 'assets/samples', sample.path);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
  }
  return validatePagesStage(target);
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args[0] === '--validate-only';
  const destination = resolve(here, args[validateOnly ? 1 : 0] || '../../web/lab-004');
  const report = validateOnly ? await validatePagesStage(destination) : await stagePages(destination);
  process.stdout.write(`LAB 004 Pages: PASS (${report.files.length} files)\n`);
}

export { stagePages, validatePagesStage };
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
