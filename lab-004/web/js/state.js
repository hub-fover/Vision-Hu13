export const MODES = Object.freeze({ SAMPLE: 'sample', LIVE: 'live' });
export function createState() { return { mode: MODES.SAMPLE, status: 'idle', frames: [], fps: 30, roi: { x: 160, y: 90, width: 320, height: 180 }, scale: { p1: [80, 300], p2: [280, 300], realDistance: 1, unit: 'm' }, result: null, error: null, tracking: { badFrames: 0, cameraStable: true } }; }
export function reducer(state, action) { const next = { ...state }; switch (action.type) {
  case 'SET_MODE': return { ...next, mode: action.mode, status: 'idle', frames: [], result: null, error: null, tracking: { badFrames: 0, cameraStable: true } };
  case 'SET_FRAMES': return { ...next, frames: action.frames, status: 'ready', result: null, error: null, tracking: { badFrames: 0, cameraStable: true } };
  case 'SET_ROI': return { ...next, roi: { ...next.roi, ...action.roi }, result: null, error: null };
  case 'SET_SCALE': return { ...next, scale: { ...next.scale, ...action.scale }, result: null, error: null };
  case 'RUNNING': return { ...next, status: 'running', result: null, error: null };
  case 'RESULT': return { ...next, status: 'success', result: action.result, error: null, tracking: { badFrames: 0, cameraStable: action.result?.diagnostics?.cameraStable !== false } };
  case 'ERROR': return { ...next, status: 'error', error: action.error, result: null };
  case 'TRACK_BAD': { const badFrames = next.tracking.badFrames + 1; return { ...next, status: badFrames >= 3 ? 'tracking-lost' : 'tracking', result: badFrames >= 3 ? null : next.result, tracking: { ...next.tracking, badFrames } }; }
  case 'CLEAR': return { ...next, frames: [], status: 'idle', result: null, error: null, tracking: { badFrames: 0, cameraStable: true } };
  default: return state;
} }
