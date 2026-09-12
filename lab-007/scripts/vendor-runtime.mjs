import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultWebRoot = resolve(scriptDir, '../web');
const onnxRuntimeLicense = resolve(scriptDir, '../third_party/onnxruntime-web-LICENSE.txt');

const runtimeFiles = [
  ['node_modules/@huggingface/transformers/LICENSE', 'licenses/transformers.txt'],
  [onnxRuntimeLicense, 'licenses/onnxruntime-web.txt'],
  ['node_modules/lucide/LICENSE', 'licenses/lucide.txt'],
  ['node_modules/qrcode/license', 'licenses/qrcode.txt'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['node_modules/lucide/dist/umd/lucide.min.js', 'lucide.min.js'],
];

const generatedRuntimeFiles = ['qrcode.min.js', 'transformers.web.min.js'];

async function packageVersion(dependencyRoot, relativePath) {
  const payload = JSON.parse(await readFile(resolve(dependencyRoot, relativePath), 'utf8'));
  return payload.version;
}

async function fileRecord(vendorRoot, path) {
  const data = await readFile(resolve(vendorRoot, path));
  return {
    path,
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

export async function validateRuntime(webRoot = defaultWebRoot) {
  const vendorRoot = resolve(webRoot, 'vendor');
  const manifest = JSON.parse(await readFile(resolve(vendorRoot, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'lab007.runtime.v1') throw new Error('unexpected LAB 007 runtime schema');
  const actual = [];
  for (const expected of manifest.files) {
    const record = await fileRecord(vendorRoot, expected.path);
    if (record.bytes !== expected.bytes || record.sha256 !== expected.sha256) {
      throw new Error(`runtime hash mismatch: ${expected.path}`);
    }
    actual.push(record);
  }
  return { schema: manifest.schema, packages: manifest.packages, files: actual };
}

export async function vendorRuntime({ webRoot = defaultWebRoot, dependencyRoot = defaultWebRoot } = {}) {
  const targetRoot = resolve(webRoot);
  const modulesRoot = resolve(dependencyRoot);
  const vendorRoot = resolve(targetRoot, 'vendor');
  await rm(vendorRoot, { recursive: true, force: true });
  await mkdir(resolve(vendorRoot, 'licenses'), { recursive: true });

  for (const [source, destination] of runtimeFiles) {
    const from = resolve(modulesRoot, source);
    const to = resolve(vendorRoot, destination);
    if (!(await stat(from)).isFile()) throw new Error(`missing runtime dependency: ${source}`);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }

  const require = createRequire(resolve(modulesRoot, 'package.json'));
  const { build } = require('esbuild');
  await build({
    entryPoints: [resolve(modulesRoot, 'node_modules/@huggingface/transformers/dist/transformers.web.min.js')],
    outfile: resolve(vendorRoot, 'transformers.web.min.js'),
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    conditions: ['onnxruntime-web-use-extern-wasm'],
    legalComments: 'none',
  });
  await build({
    entryPoints: [resolve(modulesRoot, 'node_modules/qrcode/lib/browser.js')],
    outfile: resolve(vendorRoot, 'qrcode.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'QRCode',
    platform: 'browser',
    target: ['es2020'],
    legalComments: 'none',
  });

  const files = [...runtimeFiles.map(([, destination]) => destination), ...generatedRuntimeFiles].sort();
  const manifest = {
    schema: 'lab007.runtime.v1',
    packages: {
      transformers: await packageVersion(modulesRoot, 'node_modules/@huggingface/transformers/package.json'),
      onnxruntimeWeb: await packageVersion(modulesRoot, 'node_modules/onnxruntime-web/package.json'),
      lucide: await packageVersion(modulesRoot, 'node_modules/lucide/package.json'),
      qrcode: await packageVersion(modulesRoot, 'node_modules/qrcode/package.json'),
    },
    files: await Promise.all(files.map(path => fileRecord(vendorRoot, path))),
  };
  await writeFile(resolve(vendorRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return validateRuntime(targetRoot);
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const result = checkOnly ? await validateRuntime(defaultWebRoot) : await vendorRuntime();
  const bytes = result.files.reduce((total, file) => total + file.bytes, 0);
  process.stdout.write(`LAB 007 runtime: PASS (${result.files.length} files, ${bytes} bytes)\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
