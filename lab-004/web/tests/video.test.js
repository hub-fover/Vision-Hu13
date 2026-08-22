import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSampleFrames } from '../js/measurement.js';
import {
  createAnnotatedVideo,
  drawAnnotatedFrame,
  getRecordingMimeType,
  releaseVideoUrl,
  replaceVideoUrl,
} from '../js/video.js';

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

  const pixels = frames.map((frame) => frame.pixels ?? frame.imageData?.data ??
    frame.canvas?.getContext?.('2d')?.getImageData(0, 0, frame.canvas.width, frame.canvas.height).data);
  assert.ok(pixels.every(Boolean), 'each sample frame should expose inspectable pixels');
  const hash = (values) => {
    let result = 2166136261;
    for (let index = 0; index < values.length; index += 97) {
      result ^= values[index];
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  };
  assert.notEqual(hash(pixels[0]), hash(pixels[6]), 'motion must change rendered pixels');
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

test('recording MIME detection returns null when no supported type exists', () => {
  const previous = globalThis.MediaRecorder;
  try {
    globalThis.MediaRecorder = class MediaRecorder {};
    globalThis.MediaRecorder.isTypeSupported = () => false;
    assert.equal(getRecordingMimeType(), null);
  } finally {
    if (previous === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previous;
  }
});

test('video URL replacement updates the element and revokes the previous object URL', () => {
  const calls = [];
  const urlApi = {
    createObjectURL(value) { calls.push(['create', value]); return 'blob:new'; },
    revokeObjectURL(value) { calls.push(['revoke', value]); },
  };
  const blob = { type: 'video/webm' };
  const video = { src: 'blob:old' };

  assert.equal(replaceVideoUrl(video, blob, urlApi), 'blob:new');
  assert.equal(video.src, 'blob:new');
  releaseVideoUrl(video, urlApi);
  assert.equal(video.src, '');
  assert.deepEqual(calls, [['revoke', 'blob:old'], ['create', blob], ['revoke', 'blob:new']]);
});

test('annotated video records a Blob with the minimal MediaRecorder contract', async () => {
  const previousRecorder = globalThis.MediaRecorder;
  const previousDocument = globalThis.document;
  const events = [];
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) { this.stream = stream; this.options = options; this.handlers = {}; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    start() {
      const event = { data: new Blob(['frame'], { type: 'video/webm' }) };
      this.handlers.dataavailable?.(event);
      this.ondataavailable?.(event);
    }
    stop() { this.handlers.stop?.(); this.onstop?.(); }
  }
  const context = {
    clearRect() {}, drawImage() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    save() {}, restore() {}, setLineDash() {},
  };
  const makeCanvas = () => ({
    width: 640,
    height: 360,
    getContext: () => context,
    captureStream: (fps) => ({ fps }),
  });
  try {
    globalThis.MediaRecorder = FakeMediaRecorder;
    globalThis.document = { createElement: (tag) => {
      assert.equal(tag, 'canvas');
      return makeCanvas();
    } };
    const frames = [{ canvas: makeCanvas(), timeS: 0 }, { canvas: makeCanvas(), timeS: 1 / 30 }];
    const samples = [{ dxPx: 0, dyPx: 0, dxM: 0, dyM: 0, magnitudePx: 0, magnitudeM: 0, score: 1 },
      { dxPx: 2, dyPx: 1, dxM: 0.002, dyM: 0.001, magnitudePx: 2.24, magnitudeM: 0.00224, score: 0.9 }];
    const result = await createAnnotatedVideo(frames, samples, { x: 10, y: 10, width: 100, height: 80 }, 30);
    assert.ok(result instanceof Blob);
    assert.ok(result.type.startsWith('video/webm'));
    events.push(result.size);
    assert.ok(events[0] > 0);
  } finally {
    if (previousRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousRecorder;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('annotated video reports unsupported recording explicitly', async () => {
  const previousRecorder = globalThis.MediaRecorder;
  try {
    delete globalThis.MediaRecorder;
    await assert.rejects(
      () => createAnnotatedVideo([], [], { x: 0, y: 0, width: 64, height: 64 }, 30),
      (error) => error?.code === 'VIDEO_RECORDING_UNSUPPORTED',
    );

    globalThis.MediaRecorder = class MediaRecorder {};
    globalThis.MediaRecorder.isTypeSupported = () => false;
    await assert.rejects(
      () => createAnnotatedVideo([], [], { x: 0, y: 0, width: 64, height: 64 }, 30),
      (error) => error?.code === 'VIDEO_RECORDING_UNSUPPORTED',
    );
  } finally {
    if (previousRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousRecorder;
  }
});
