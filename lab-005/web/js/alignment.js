import { makeError } from './errors.js';

export function checkAlignment(frames, maxErrorPx = 2) {
  if (!frames?.length) throw makeError('INVALID_FRAME_COUNT');
  const width = frames[0].width; const height = frames[0].height;
  if (frames.some(frame => frame.width !== width || frame.height !== height)) throw makeError('ALIGNMENT_FAILED');
  const reference = frames[Math.floor(frames.length / 2)];
  const shifts = frames.map(frame => ({ dx: (frame.meanX || 0) - (reference.meanX || 0), dy: (frame.meanY || 0) - (reference.meanY || 0) }));
  const max = Math.max(...shifts.map(shift => Math.hypot(shift.dx, shift.dy)));
  if (max > maxErrorPx * 4) throw makeError('CAMERA_MOVED', `max shift ${max.toFixed(2)}px`);
  return { referenceIndex: Math.floor(frames.length / 2), shifts, maxErrorPx: max };
}

export function normalizeFrame(frame) { return { ...frame, width: Number(frame.width), height: Number(frame.height), meanX: Number(frame.meanX || 0), meanY: Number(frame.meanY || 0) }; }

function sampledError(reference, frame, width, height, dx, dy, step) {
  let sum = 0; let count = 0;
  for (let y = 0; y < height; y += step) {
    const sy = y + dy; if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x += step) {
      const sx = x + dx; if (sx < 0 || sx >= width) continue;
      const delta = reference[y * width + x] - frame[sy * width + sx]; sum += delta * delta; count++;
    }
  }
  return count ? sum / count : Number.POSITIVE_INFINITY;
}

function shiftGray(gray, width, height, dx, dy) {
  const shifted = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) {
    const sy = y + dy; if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = x + dx; if (sx >= 0 && sx < width) shifted[y * width + x] = gray[sy * width + sx];
    }
  }
  return shifted;
}

function structuralVector(frame, size = 16) {
  const values = new Float32Array(size * size); const counts = new Uint16Array(size * size);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const bx = Math.min(size - 1, Math.floor(x * size / frame.width)); const by = Math.min(size - 1, Math.floor(y * size / frame.height)); const index = by * size + bx;
    values[index] += frame.gray[y * frame.width + x]; counts[index]++;
  }
  let mean = 0; for (let index = 0; index < values.length; index++) { values[index] /= Math.max(1, counts[index]); mean += values[index]; } mean /= values.length;
  let norm = 0; for (let index = 0; index < values.length; index++) { values[index] -= mean; norm += values[index] * values[index]; } norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let index = 0; index < values.length; index++) values[index] /= norm;
  return values;
}

export function validateSceneConsistency(frames, minCorrelation = 0.55) {
  if (!Array.isArray(frames) || frames.length !== 5 || frames.some(frame => !frame.gray)) throw makeError('INVALID_FRAME_COUNT');
  const reference = structuralVector(frames[2]); let minimum = 1;
  for (const frame of frames) { const vector = structuralVector(frame); let correlation = 0; for (let index = 0; index < vector.length; index++) correlation += reference[index] * vector[index]; minimum = Math.min(minimum, correlation); }
  if (minimum < minCorrelation) throw makeError('SCENE_CHANGED', `minimum structural correlation ${minimum.toFixed(3)}`);
  return minimum;
}

/** Align grayscale frames with a bounded translation search before focus scoring. */
export function alignFrames(frames, maxErrorPx = 2) {
  if (!Array.isArray(frames) || frames.length !== 5) throw makeError('INVALID_FRAME_COUNT');
  const normalized = frames.map(normalizeFrame); const referenceIndex = 2; const reference = normalized[referenceIndex];
  if (!reference.gray || normalized.some(frame => !frame.gray || frame.gray.length !== reference.gray.length)) return { frames: normalized, referenceIndex, shifts: [], errors: [], applied: false, method: 'metadata-only' };
  validateSceneConsistency(normalized);
  const width = reference.width; const height = reference.height; const step = Math.max(1, Math.ceil(Math.max(width, height) / 96)); const search = Math.max(4, Math.ceil(maxErrorPx * 4));
  const shifts = []; const errors = []; const aligned = normalized.map((frame, index) => {
    if (index === referenceIndex) { shifts.push({ dx: 0, dy: 0 }); errors.push(0); return frame; }
    let best = { error: Number.POSITIVE_INFINITY, dx: 0, dy: 0 };
    for (let dy = -search; dy <= search; dy++) for (let dx = -search; dx <= search; dx++) { const error = sampledError(reference.gray, frame.gray, width, height, dx, dy, step); if (error < best.error) best = { error, dx, dy }; }
    const rms = Math.sqrt(best.error); if (!Number.isFinite(rms) || rms > 0.18) throw makeError('CAMERA_MOVED', `alignment RMS ${rms.toFixed(3)}`);
    shifts.push({ dx: best.dx, dy: best.dy }); errors.push(rms); return { ...frame, gray: shiftGray(frame.gray, width, height, best.dx, best.dy), meanX: reference.meanX, meanY: reference.meanY };
  });
  return { frames: aligned, referenceIndex, shifts, errors, maxErrorPx: Math.max(...shifts.map(shift => Math.hypot(shift.dx, shift.dy))), applied: true, method: 'bounded-translation-correlation' };
}
