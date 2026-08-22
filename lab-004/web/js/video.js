const RECORDING_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
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
  const value = finite(metres);
  const normalized = String(unit || 'm').toLowerCase();
  if (normalized === 'mm') return `${(value * 1000).toFixed(2)} mm`;
  if (normalized === 'cm') return `${(value * 100).toFixed(2)} cm`;
  return `${value.toFixed(3)} m`;
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
  const source = frame?.canvas || frame?.image || frame?.bitmap || frame;
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
  const magnitudeM = Number.isFinite(Number(sample.magnitudeM))
    ? Number(sample.magnitudeM)
    : Math.hypot(dxPx, dyPx) * finite(scale.metresPerPixel);
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
  const temporaryCanvas = document.createElement('canvas');
  temporaryCanvas.width = 640;
  temporaryCanvas.height = 360;
  const stream = temporaryCanvas.captureStream?.(Number(fps) > 0 ? Number(fps) : 30);
  if (!stream) {
    temporaryCanvas.width = 0;
    temporaryCanvas.height = 0;
    throw makeError('VIDEO_RECORDING_UNSUPPORTED');
  }

  let recorder;
  try {
    recorder = new globalThis.MediaRecorder(stream, { mimeType });
  } catch (error) {
    stopTracks(stream);
    temporaryCanvas.width = 0;
    temporaryCanvas.height = 0;
    throw error;
  }

  const parts = [];
  let settled = false;
  let stopping = false;
  let cancelled = false;
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
    else resolveResult(new Blob(parts, { type: mimeType }));
  };
  const onData = (event) => {
    if (event?.data && (typeof event.data.size !== 'number' || event.data.size > 0)) parts.push(event.data);
  };
  const onStop = () => settle(cancelled ? makeError('CANCELLED') : null);
  const onError = (event) => settle(event?.error || makeError('VIDEO_RECORDING_FAILED'));
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
    try { recorder.stop(); } catch (error) { settle(cancelled ? makeError('CANCELLED') : error); }
  };

  try {
    recorder.start();
    const list = Array.isArray(frames) ? frames : [];
    const sampleList = Array.isArray(samples) ? samples : [];
    for (let index = 0; index < list.length; index += 1) {
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
      // Let the browser's MediaRecorder observe the newly painted canvas.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!stopping) stopRecorder(false);
  } catch (error) {
    if (!stopping) stopRecorder(false);
    settle(error);
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
