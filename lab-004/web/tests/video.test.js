import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSampleFrames } from '../js/measurement.js';
import { drawAnnotatedFrame, getRecordingMimeType } from '../js/video.js';

test('sample frames are renderable 640x360 frames with motion metadata', () => {
  const frames = buildSampleFrames(12, 30);

  assert.equal(frames.length, 12);
  frames.forEach((frame, index) => {
    assert.ok(frame.canvas, `frame ${index} should include a canvas`);
    assert.equal(frame.canvas.width, 640);
    assert.equal(frame.canvas.height, 360);
    assert.equal(typeof frame.timeS, 'number');
    assert.equal(typeof frame.offsetX, 'number');
    assert.equal(typeof frame.offsetY, 'number');
  });
  assert.equal(frames[0].timeS, 0);
});

test('annotated first frame explains zero displacement from the initial frame', () => {
  const labels = [];
  const context = {
    save() {},
    restore() {},
    drawImage() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText(text) { labels.push(String(text)); },
    setLineDash() {},
  };
  const canvas = { width: 640, height: 360, getContext: () => context };
  const frame = { canvas, timeS: 0, offsetX: 0, offsetY: 0 };

  drawAnnotatedFrame(canvas, frame, frame, {
    dxPx: 0,
    dyPx: 0,
    magnitudePx: 0,
    dxM: 0,
    dyM: 0,
    magnitudeM: 0,
    score: 1,
  }, { x: 220, y: 110, width: 180, height: 120 }, {
    metresPerPixel: 0.001,
    unit: 'mm',
  });

  assert.ok(labels.some((text) => text.includes('相对于初始帧')));
  assert.ok(labels.some((text) => text.includes('Δx: 0.00 px')));
  assert.ok(labels.some((text) => text.includes('Δy: 0.00 px')));
  assert.ok(labels.some((text) => text.includes('位移: 0.00 mm')));
});

test('recording MIME detection returns null without MediaRecorder', () => {
  const previous = globalThis.MediaRecorder;
  try {
    delete globalThis.MediaRecorder;
    assert.equal(getRecordingMimeType(), null);
  } finally {
    if (previous === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previous;
  }
});
