#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(labRoot, '..');
const webDir = join(repoRoot, 'web', 'lab-006');
const requiredFiles = [
  'index.html', 'calibration.html', 'measurement.html', 'tutorial.html',
  'css/style.css', 'js/calibration.js', 'js/measurement.js', 'js/utils.js',
  'vendor/opencv.js', 'vendor/opencv.wasm', 'assets/checkerboard-template.html',
  'assets/samples/manifest.json', 'assets/samples/sample-calibration.json', 'assets/samples/sample-corners.json'
];
let failed = false;
for (const file of requiredFiles) {
  const target = join(webDir, file);
  if (!existsSync(target) || statSync(target).size === 0) { console.error(`FAIL ${file}`); failed = true; }
  else console.log(`OK   ${file}`);
}
const manifestPath = join(webDir, 'assets/samples/manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const item of manifest.calibrationImages || []) {
    const target = join(webDir, 'assets/samples', item.path);
    if (!existsSync(target) || statSync(target).size === 0) { console.error(`FAIL assets/samples/${item.path}`); failed = true; }
  }
}
for (const html of ['calibration.html', 'measurement.html']) {
  const text = readFileSync(join(webDir, html), 'utf8');
  if (!text.includes('vendor/opencv.js')) { console.error(`FAIL ${html} does not use same-origin OpenCV`); failed = true; }
  if (text.includes('</script></script>')) { console.error(`FAIL ${html} has duplicate script closing tag`); failed = true; }
}
if (failed) process.exit(1);
console.log('All LAB 006 Pages resources validated.');
