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
