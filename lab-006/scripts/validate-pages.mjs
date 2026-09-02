#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const webDir = join(repoRoot, 'web', 'lab-006');

const requiredFiles = [
  'index.html',
  'calibration.html',
  'measurement.html',
  'tutorial.html',
  'css/style.css',
  'js/calibration.js',
  'js/measurement.js',
  'js/utils.js',
  'assets/checkerboard-template.html'
];

console.log('🔍 验证 LAB 006 Pages 构建...\n');

let allPassed = true;

for (const file of requiredFiles) {
  const filePath = join(webDir, file);
  const exists = existsSync(filePath);

  if (exists) {
    const size = readFileSync(filePath).length;
    console.log(`✅ ${file} (${(size / 1024).toFixed(2)} KB)`);
  } else {
    console.log(`❌ ${file} - 文件不存在`);
    allPassed = false;
  }
}

console.log('\n📊 总结:');
if (allPassed) {
  console.log('✅ 所有必需文件已正确构建到 web/lab-006/');
  console.log('\n🌐 本地测试: http://localhost:8080/lab-006/');
  console.log('🌐 在线地址: https://hub-fover.github.io/Vision-Hu13/lab-006/');
  process.exit(0);
} else {
  console.log('❌ 部分文件缺失，请运行: npm run build:lab006');
  process.exit(1);
}
