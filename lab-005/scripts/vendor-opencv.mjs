import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const VERSION = '4.12.0-release.1'; const GZIP_TARGET_BYTES = 8 * 1024 * 1024;
const scriptDirectory = dirname(fileURLToPath(import.meta.url)); const webDirectory = resolve(scriptDirectory, '../web'); const packageDirectory = resolve(webDirectory, 'node_modules/@techstark/opencv-js'); const source = resolve(packageDirectory, 'dist/opencv.js'); const destination = resolve(webDirectory, 'vendor/opencv.js'); const manifestPath = resolve(webDirectory, 'vendor/manifest.local.json');
const packageJson = JSON.parse(await readFile(resolve(packageDirectory, 'package.json'), 'utf8')); if (packageJson.version !== VERSION || packageJson.license !== 'Apache-2.0') throw new Error(`Unexpected OpenCV package: ${packageJson.version} / ${packageJson.license}`);
const artifact = await readFile(source); const gzipBytes = gzipSync(artifact, { level: 9, mtime: 0 }).byteLength; if (gzipBytes > GZIP_TARGET_BYTES) throw new Error(`OpenCV.js gzip size ${gzipBytes} exceeds 8MiB`);
await mkdir(dirname(destination), { recursive: true }); await copyFile(source, destination);

// The published 4.12 package omits the high-level chessboard detector and
// calibrateCamera wrapper, but it does export calibrateCameraExtended and the
// imgproc primitives used by our conservative browser detector. Record the
// actual capability rather than relying on TypeScript declarations.
const manifest = {
  package: '@techstark/opencv-js',
  version: VERSION,
  license: 'Apache-2.0',
  source: 'node_modules/@techstark/opencv-js/dist/opencv.js',
  rawBytes: (await stat(destination)).size,
  gzipBytes,
  gzipTargetBytes: GZIP_TARGET_BYTES,
  sha256: createHash('sha256').update(artifact).digest('hex'),
  requiredModules: ['core', 'imgproc', 'calib3d.calibrateCameraExtended'],
  optionalModules: ['calib3d.findChessboardCorners'],
  capabilities: {
    chessboardCalibration: true,
    calibrateCamera: false,
    findChessboardCorners: false,
    calibrateCameraExtended: true,
    checkerboardFallback: true,
    undistort: true,
  },
  calibrationFallback: 'browser-checkerboard-fallback-with-python-reference',
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'); process.stdout.write(`${JSON.stringify(manifest)}\n`);
