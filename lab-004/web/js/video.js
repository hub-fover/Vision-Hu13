const RECORDING_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function setDash(context, values) {
  if (typeof context.setLineDash === 'function') context.setLineDash(values);
}

function drawLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function distanceLabel(metres, unit) {
  if (!Number.isFinite(Number(metres))) return '未标定';
  const value = Number(metres);
  const normalized = String(unit || 'm').toLowerCase();
  if (normalized === 'mm') return `${(value * 1000).toFixed(2)} mm`;
  if (normalized === 'cm') return `${(value * 100).toFixed(2)} cm`;
  return `${value.toFixed(3)} m`;
}

function sourceFor(frame) {
  return frame?.canvas || frame?.image || frame?.bitmap || frame;
}

function pointXY(point) {
  if (Array.isArray(point)) return [finite(point[0]), finite(point[1])];
  return [finite(point?.x), finite(point?.y)];
}

function metresPerPixel(scale = {}) {
  const direct = [scale.metresPerPixel, scale.mPerPx, scale.scaleMPerPx]
    .map(Number).find(Number.isFinite);
  if (direct !== undefined && direct > 0) return direct;
  const [x1, y1] = pointXY(scale.p1);
  const [x2, y2] = pointXY(scale.p2);
  const pixels = Math.hypot(x2 - x1, y2 - y1);
  const real = Number(scale.realDistance);
  if (!(pixels > 0) || !(real > 0) || !Number.isFinite(real)) return null;
  const unit = String(scale.unit || 'm').toLowerCase();
  const unitFactor = unit === 'mm' ? 0.001 : unit === 'cm' ? 0.01 : unit === 'm' ? 1 : null;
  return unitFactor === null ? null : real * unitFactor / pixels;
}

/**
 * Draw one measurement frame and its displacement annotation.
 * Coordinates are deliberately kept in the same analysis-space as `roi`.
 */
export function drawAnnotatedFrame(
  canvas,
  frame,
  initialFrame,
  sample = {},
  roi = {},
  scale = {},
  index,
  total,
) {
  if (!canvas) return;
  const context = canvas.getContext?.('2d');
  if (!context) return;

  const width = finite(canvas.width, 640);
  const height = finite(canvas.height, 360);
  const source = sourceFor(frame);
  if (source && typeof context.drawImage === 'function') {
    context.drawImage(source, 0, 0, width, height);
  } else if (typeof context.clearRect === 'function') {
    context.clearRect(0, 0, width, height);
  }

  const x = finite(roi.x);
  const y = finite(roi.y);
  const roiWidth = Math.max(0, finite(roi.width));
  const roiHeight = Math.max(0, finite(roi.height));
  const startX = x + roiWidth / 2;
  const startY = y + roiHeight / 2;
  const dxPx = finite(sample.dxPx);
  const dyPx = finite(sample.dyPx);
  const endX = startX + dxPx;
  const endY = startY + dyPx;

  // A faint crop of the first frame gives the viewer a visual reference in
  // addition to the dashed outline and displacement arrow.
  const initialSource = sourceFor(initialFrame);
  if (initialSource && typeof context.drawImage === 'function' && roiWidth > 0 && roiHeight > 0) {
    if (typeof context.save === 'function') context.save();
    context.globalAlpha = 0.2;
    context.drawImage(initialSource, x, y, roiWidth, roiHeight, x, y, roiWidth, roiHeight);
    if (typeof context.restore === 'function') context.restore();
  }

  if (typeof context.save === 'function') context.save();
  context.lineWidth = 2;
  context.strokeStyle = '#8ef2d5';
  setDash(context, [8, 6]);
  drawLine(context, x, y, x + roiWidth, y);
  drawLine(context, x + roiWidth, y, x + roiWidth, y + roiHeight);
  drawLine(context, x + roiWidth, y + roiHeight, x, y + roiHeight);
  drawLine(context, x, y + roiHeight, x, y);
  setDash(context, []);

  context.strokeStyle = '#ffd166';
  drawLine(context, startX, startY, endX, endY);
  // A small arrow head makes direction readable even when the displacement is
  // only a few pixels. The zero-displacement case still emits a stroke above.
  const angle = Math.atan2(dyPx, dxPx);
  const head = 9;
  const left = angle + Math.PI * 0.82;
  const right = angle - Math.PI * 0.82;
  drawLine(context, endX, endY, endX + Math.cos(left) * head, endY + Math.sin(left) * head);
  drawLine(context, endX, endY, endX + Math.cos(right) * head, endY + Math.sin(right) * head);

  context.fillStyle = '#ffffff';
  context.font = '600 14px system-ui, sans-serif';
  const mPerPx = metresPerPixel(scale);
  const magnitudeM = Number.isFinite(Number(sample.magnitudeM))
    ? Number(sample.magnitudeM)
    : (mPerPx === null ? null : Math.hypot(dxPx, dyPx) * mPerPx);
  const confidence = Number.isFinite(Number(sample.score)) ? Number(sample.score) : null;
  const timeS = Number.isFinite(Number(frame?.timeS)) ? Number(frame.timeS) : null;
  const frameLabel = Number.isFinite(Number(index))
    ? `帧: ${Number(index) + 1}/${Number.isFinite(Number(total)) ? Number(total) : '?'}`
    : null;
  const labels = [
    '相对于初始帧',
    `Δx: ${dxPx.toFixed(2)} px`,
    `Δy: ${dyPx.toFixed(2)} px`,
    `位移: ${distanceLabel(magnitudeM, scale.unit)}`,
  ];
  if (timeS !== null) labels.push(`时间: ${timeS.toFixed(2)} s`);
  if (frameLabel) labels.push(frameLabel);
  if (confidence !== null) labels.push(`置信度: ${(confidence * 100).toFixed(0)}%`);
  if (typeof context.fillText === 'function') {
    const leftText = 12;
    let textY = 24;
    labels.forEach((label) => {
      context.fillText(label, leftText, textY);
      textY += 19;
    });
  }
  if (typeof context.restore === 'function') context.restore();
}

export function getRecordingMimeType() {
  const recorder = globalThis.MediaRecorder;
  if (typeof recorder !== 'function' || typeof recorder.isTypeSupported !== 'function') return null;
  return RECORDING_TYPES.find((type) => {
    try { return recorder.isTypeSupported(type); } catch { return false; }
  }) || null;
}

function makeError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function stopTracks(stream) {
  try {
    const tracks = stream?.getTracks?.() || [];
    tracks.forEach((track) => { try { track.stop?.(); } catch { /* release best effort */ } });
  } catch { /* release best effort */ }
}

/**
 * Render and record annotated frames without materialising a second frame
 * array. Each iteration yields once so MediaRecorder can consume the canvas.
 */
export async function createAnnotatedVideo(frames, samples, roi, fps, options = {}) {
  const mimeType = getRecordingMimeType();
  if (!mimeType || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw makeError('VIDEO_RECORDING_UNSUPPORTED');
  }
  const list = Array.isArray(frames) ? frames : [];
  const sampleList = Array.isArray(samples) ? samples : [];
  const rate = Number(fps);
  if (list.length < 2 || sampleList.length !== list.length || !Number.isFinite(rate) || rate <= 0) {
    throw makeError('INVALID_FRAME');
  }
  const firstSource = sourceFor(list[0]);
  const sourceWidth = finite(options.width, finite(firstSource?.width, 640));
  const sourceHeight = finite(options.height, finite(firstSource?.height, 360));
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) throw makeError('INVALID_FRAME');
  const temporaryCanvas = document.createElement('canvas');
  temporaryCanvas.width = sourceWidth;
  temporaryCanvas.height = sourceHeight;
  let stream;
  let requestFrame = null;
  let timedCapture = false;
  try {
    // A zero frame-rate track lets us explicitly request exactly one frame per
    // painted annotation where the browser supports CanvasCaptureMediaStreamTrack.
    stream = temporaryCanvas.captureStream?.(0);
  } catch (error) {
    // A few implementations reject a zero-rate track outright. Retry with a
    // timed track before reporting that local recording is unavailable.
    try {
      stream = temporaryCanvas.captureStream?.(rate);
      timedCapture = true;
    } catch (fallbackError) {
      temporaryCanvas.width = 0;
      temporaryCanvas.height = 0;
      throw makeError('VIDEO_RECORDING_UNSUPPORTED', fallbackError?.message || error?.message || 'captureStream failed');
    }
  }
  if (!stream) {
    temporaryCanvas.width = 0;
    temporaryCanvas.height = 0;
    throw makeError('VIDEO_RECORDING_UNSUPPORTED');
  }

  const streamTracks = () => (typeof stream.getVideoTracks === 'function'
    ? stream.getVideoTracks()
    : (typeof stream.getTracks === 'function' ? stream.getTracks() : null));
  const initialTracks = streamTracks();
  requestFrame = initialTracks?.find((track) => typeof track?.requestFrame === 'function') || null;
  // CanvasCaptureMediaStreamTrack.requestFrame is unavailable in some Safari
  // builds. Recreate the track with a non-zero rate so it can still encode.
  if (!requestFrame && !timedCapture) {
    if (initialTracks) stopTracks(stream);
    try {
      stream = temporaryCanvas.captureStream?.(rate);
    } catch (error) {
      temporaryCanvas.width = 0;
      temporaryCanvas.height = 0;
      throw makeError('VIDEO_RECORDING_UNSUPPORTED', error?.message || 'captureStream failed');
    }
    if (!stream) {
      temporaryCanvas.width = 0;
      temporaryCanvas.height = 0;
      throw makeError('VIDEO_RECORDING_UNSUPPORTED');
    }
    timedCapture = true;
  }

  let recorder;
  try {
    recorder = new globalThis.MediaRecorder(stream, { mimeType });
  } catch (error) {
    stopTracks(stream);
    temporaryCanvas.width = 0;
    temporaryCanvas.height = 0;
    throw makeError('VIDEO_RECORDING_UNSUPPORTED', error?.message || 'MediaRecorder failed');
  }

  const parts = [];
  let settled = false;
  let stopping = false;
  let cancelled = false;
  let failure = null;
  let frameCount = 0;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });

  const cleanup = () => {
    stopTracks(stream);
    temporaryCanvas.width = 0;
    temporaryCanvas.height = 0;
  };
  const settle = (error) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (error) rejectResult(error);
    else {
      const blob = new Blob(parts, { type: mimeType });
      // Blob remains a normal Blob for download/playback, while this diagnostic
      // metadata is useful to callers and costs no additional frame storage.
      try { Object.defineProperty(blob, 'frameCount', { value: frameCount, enumerable: false }); } catch { /* Blob may be sealed */ }
      resolveResult(blob);
    }
  };
  const onData = (event) => {
    if (event?.data && (typeof event.data.size !== 'number' || event.data.size > 0)) parts.push(event.data);
  };
  const onStop = () => settle(failure || (cancelled ? makeError('CANCELLED') : null));
  const onError = (event) => {
    stopping = true;
    failure = event?.error || makeError('VIDEO_RECORDING_FAILED');
    settle(failure);
  };
  const hasEventTarget = typeof recorder.addEventListener === 'function';
  if (hasEventTarget) {
    recorder.addEventListener('dataavailable', onData);
    recorder.addEventListener('stop', onStop);
    recorder.addEventListener('error', onError);
  } else {
    recorder.ondataavailable = onData;
    recorder.onstop = onStop;
    recorder.onerror = onError;
  }

  const stopRecorder = (isCancelled) => {
    cancelled ||= Boolean(isCancelled);
    if (stopping) return;
    stopping = true;
    try { recorder.stop(); } catch (error) {
      settle(failure || (cancelled ? makeError('CANCELLED') : error));
    }
  };

  try {
    try { recorder.start(); } catch (error) {
      throw makeError('VIDEO_RECORDING_UNSUPPORTED', error?.message || 'MediaRecorder.start failed');
    }
    for (let index = 0; index < list.length; index += 1) {
      if (settled || stopping || failure) break;
      if (typeof options.shouldCancel === 'function' && options.shouldCancel()) {
        stopRecorder(true);
        break;
      }
      drawAnnotatedFrame(
        temporaryCanvas,
        list[index],
        list[0],
        sampleList[index] || {},
        roi,
        options.scale || options.measurementScale || {},
        index,
        list.length,
      );
      frameCount += 1;
      if (requestFrame) {
        try { requestFrame.requestFrame(); } catch (error) {
          throw makeError('VIDEO_RECORDING_UNSUPPORTED', error?.message || 'requestFrame failed');
        }
      }
      // Keep the generated video duration close to the source sampling rate.
      // This also gives MediaRecorder time to consume a manually requested frame.
      await new Promise((resolve) => setTimeout(resolve, 1000 / rate));
    }
    if (!stopping) stopRecorder(false);
  } catch (error) {
    failure = error?.code ? error : makeError('VIDEO_RECORDING_UNSUPPORTED', error?.message || 'recording failed');
    if (!stopping) stopRecorder(false);
    else settle(failure);
  }
  return result;
}

export function releaseVideoUrl(url, urlApi = URL) {
  if (typeof url === 'string' && url.startsWith('blob:')) urlApi?.revokeObjectURL?.(url);
}

export function replaceVideoUrl(videoElement, blob, urlApi = URL) {
  const previous = videoElement?.src;
  releaseVideoUrl(previous, urlApi);
  const next = urlApi.createObjectURL(blob);
  if (videoElement) videoElement.src = next;
  return next;
}
