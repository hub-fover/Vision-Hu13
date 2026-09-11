import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../web/js/utils.js', import.meta.url), 'utf8') + '\nthis.api = { solveHomography, mapPointWithHomography, createBoardObjectPoints, validateCalibrationData, captureVideoFrame, orderCheckerboardCorners };';
const context = { document: {}, localStorage: {}, console, setTimeout, clearTimeout, Promise, Number, Math, Date };
vm.createContext(context);
vm.runInContext(source, context);
const { solveHomography, mapPointWithHomography, createBoardObjectPoints, validateCalibrationData, captureVideoFrame, orderCheckerboardCorners } = context.api;

test('creates board object points in row-major order', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(createBoardObjectPoints(3, 2, 25))), [
    { x: 0, y: 0, z: 0 }, { x: 25, y: 0, z: 0 }, { x: 50, y: 0, z: 0 },
    { x: 0, y: 25, z: 0 }, { x: 25, y: 25, z: 0 }, { x: 50, y: 25, z: 0 }
  ]);
});

test('maps a perspective quadrilateral to millimetres', () => {
  const homography = solveHomography(
    [{ x: 10, y: 10 }, { x: 110, y: 15 }, { x: 100, y: 90 }, { x: 15, y: 80 }],
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 75 }, { x: 0, y: 75 }]
  );
  const mapped = mapPointWithHomography({ x: 10, y: 10 }, homography);
  assert.ok(Math.abs(mapped.x) < 1e-6);
  assert.ok(Math.abs(mapped.y) < 1e-6);
  const interior = mapPointWithHomography({ x: 60, y: 50 }, homography);
  assert.ok(Number.isFinite(interior.x) && Number.isFinite(interior.y));
});

test('rejects malformed calibration data', () => {
  assert.equal(validateCalibrationData(null).valid, false);
  assert.equal(validateCalibrationData({ cameraMatrix: Array(9).fill(1), distCoeffs: Array(5).fill(0), imageSize: { width: 640, height: 480 }, squareSize: 25, boardConfig: { width: 9, height: 6 } }).valid, true);
});

test('synchronizes video dimensions before reading an OpenCV frame', () => {
  let readSize = null;
  context.cv = {
    CV_8UC4: 24,
    Mat: class {
      constructor(rows, cols, type) { this.rows = rows; this.cols = cols; this.type = type; this.deleted = false; }
      delete() { this.deleted = true; }
    },
    VideoCapture: class {
      constructor(video) { this.video = video; }
      read(frame) {
        assert.equal(frame.cols, this.video.width);
        assert.equal(frame.rows, this.video.height);
        readSize = [frame.cols, frame.rows];
      }
    }
  };
  const video = { videoWidth: 1280, videoHeight: 720, width: 300, height: 150 };
  const frame = captureVideoFrame(video);
  assert.deepEqual(readSize, [1280, 720]);
  assert.equal(video.width, 1280);
  assert.equal(video.height, 720);
  frame.delete();
});

test('orders an unordered perspective 9x6 checkerboard grid', () => {
  const perspective = solveHomography(
    [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 0, y: 5 }],
    [{ x: 120, y: 80 }, { x: 510, y: 105 }, { x: 470, y: 390 }, { x: 155, y: 350 }]
  );
  const points = [];
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 9; column += 1) points.push(mapPointWithHomography({ x: column, y: row }, perspective));
  }
  const unordered = points.slice().sort((a, b) => ((a.x * 17 + a.y * 31) % 97) - ((b.x * 17 + b.y * 31) % 97));
  const ordered = orderCheckerboardCorners(unordered, 9, 6);
  assert.equal(ordered.length, 54);
  const normalized = solveHomography(
    [ordered[0], ordered[8], ordered[53], ordered[45]],
    [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 0, y: 5 }]
  );
  ordered.forEach((point, index) => {
    const mapped = mapPointWithHomography(point, normalized);
    assert.ok(Math.abs(mapped.x - index % 9) < 1e-6);
    assert.ok(Math.abs(mapped.y - Math.floor(index / 9)) < 1e-6);
  });
});
