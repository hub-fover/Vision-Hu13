export const INPUT_COUNT = 5;
export const MODES = Object.freeze({ relative: 'relative', intrinsics: 'intrinsics', scale: 'scale' });

export function createInitialState() {
  return {
    mode: MODES.relative,
    frames: Array.from({ length: INPUT_COUNT }, (_, index) => ({ index, file: null, bitmap: null, url: '', label: ['近焦', '近中焦', '中焦', '远中焦', '远焦'][index] })),
    result: null,
    calibration: null,
    scaleCalibration: null,
    requestId: null,
    cancelled: false
  };
}

export function resetFrames(state) {
  state.frames.forEach(frame => { if (frame.bitmap?.close) frame.bitmap.close(); if (frame.url) URL.revokeObjectURL(frame.url); frame.file = null; frame.bitmap = null; frame.url = ''; });
  state.result = null;
}

export function setFrame(state, index, file, bitmap, url = '') {
  const current = state.frames[index];
  if (current?.bitmap?.close) current.bitmap.close();
  if (current?.url) URL.revokeObjectURL(current.url);
  state.frames[index] = { ...current, file, bitmap, url };
  return state.frames[index];
}

export function readyFrames(state) { return state.frames.every(frame => frame.file || frame.bitmap); }
export function moveFrame(state, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= state.frames.length || toIndex < 0 || toIndex >= state.frames.length || fromIndex === toIndex) return false;
  const [frame] = state.frames.splice(fromIndex, 1); state.frames.splice(toIndex, 0, frame); state.frames.forEach((item, index) => { item.index = index; item.label = ['近焦', '近中焦', '中焦', '远中焦', '远焦'][index]; }); return true;
}
