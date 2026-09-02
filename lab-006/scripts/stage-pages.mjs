#!/usr/bin/env node
/**
 * LAB 006: Stage for GitHub Pages
 * Copies web directory to ../../web/lab-006/
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const labRoot = join(__dirname, '..');
const webSrc = join(labRoot, 'web');
const repoRoot = join(labRoot, '..');
const webDst = join(repoRoot, 'web', 'lab-006');

console.log('Staging LAB 006 for GitHub Pages...');
console.log(`Source: ${webSrc}`);
console.log(`Destination: ${webDst}`);

// Clean destination
if (existsSync(webDst)) {
    console.log('Cleaning existing deployment...');
    rmSync(webDst, { recursive: true, force: true });
}

// Copy recursively
function copyDir(src, dst) {
    mkdirSync(dst, { recursive: true });

    const entries = readdirSync(src);

    for (const entry of entries) {
        const srcPath = join(src, entry);
        const dstPath = join(dst, entry);

        const stat = statSync(srcPath);

        if (stat.isDirectory()) {
            copyDir(srcPath, dstPath);
        } else {
            copyFileSync(srcPath, dstPath);
        }
    }
}

copyDir(webSrc, webDst);

// Count files
function countFiles(dir) {
    let count = 0;
    const entries = readdirSync(dir);

    for (const entry of entries) {
        const path = join(dir, entry);
        const stat = statSync(path);

        if (stat.isDirectory()) {
            count += countFiles(path);
        } else {
            count++;
        }
    }

    return count;
}

const fileCount = countFiles(webDst);

console.log(`\n✅ Staged ${fileCount} files to web/lab-006/`);
console.log('Ready for GitHub Pages deployment!');
