import { CONTRACTS, metresPerPixel, validateTarget } from './contracts.js';

const W = 640; const H = 360;
export const SAMPLE_SCENARIOS = Object.freeze({ 'static-scene-speed': { label: '静止纹理测速' } });
function canvasFactory() {
  if (typeof document !== 'undefined' && document.createElement) return document.createElement('canvas');
  const canvas = { width: W, height: H, _index: 0 }; const context = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {}, clearRect() {}, arc() {}, fill() {}, getImageData: () => { const data = new Uint8ClampedArray(W * H * 4); data.fill(canvas._index % 255); return { data }; } }; canvas.getContext = () => context; return canvas;
}
function makeFrame(index, fps, speed = 1) {
  const canvas = canvasFactory(); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#17242b'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#42616a'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const t = index / fps; const dx = -24 * t * speed; const dy = -4 * Math.sin(t * Math.PI * 2 * speed);
  ctx.fillStyle = '#c5a05b'; ctx.fillRect(180 + dx, 90 + dy, 300, 190);
  ctx.fillStyle = '#233f47'; for (let x = 195; x < 465; x += 28) for (let y = 105; y < 265; y += 28) ctx.fillRect(x + dx, y + dy, 10, 10);
  ctx.fillStyle = '#ecf7ef'; ctx.font = '14px sans-serif'; ctx.fillText('STATIC SCENE', 210 + dx, 180 + dy);
  canvas._index = index; return { canvas, source: 'sample', timeS: t, offsetX: dx, offsetY: dy };
}
export function buildSampleFrames(count = 180, fps = 30, speed = 1) { return Array.from({ length: Math.max(2, count) }, (_, i) => makeFrame(i, fps, speed)); }
export function buildSampleFlowSeries(count = 180, fps = 30) { return Array.from({ length: Math.max(2, count) }, (_, i) => ({ frameIndex: i, timeS: i / fps, dxPx: -24 * i / fps, dyPx: -4 * Math.sin(i / fps * Math.PI * 2), score: .94, valid: true, inlierCount: 80, inlierRatio: .9, medianReprojectionErrorPx: .4 })); }

export function measureMotions(motions, { roi = { x: 160, y: 90, width: 320, height: 180 }, scale, fps = 30 } = {}) {
  if (!Array.isArray(motions) || motions.length < 2) throw Object.assign(new Error('INVALID_FRAME'), { code: 'INVALID_FRAME' });
  validateTarget(roi, 640, 360); const mPerPx = metresPerPixel(scale.p1, scale.p2, scale.realDistance, scale.unit);
  const first = motions[0]; const samples = motions.map((motion, index) => {
    const timeS = Number.isFinite(motion.timeS) ? motion.timeS : index / fps;
    const dxPx = Number(motion.dxPx ?? motion.offsetX ?? 0) - Number(first.dxPx ?? first.offsetX ?? 0);
    const dyPx = Number(motion.dyPx ?? motion.offsetY ?? 0) - Number(first.dyPx ?? first.offsetY ?? 0);
    const previous = motions[index - 1]; const dt = previous ? timeS - (Number.isFinite(previous.timeS) ? previous.timeS : (index - 1) / fps) : 0;
    const vx = previous && dt > 0 ? -((dxPx - (Number(previous.dxPx ?? previous.offsetX ?? 0) - Number(first.dxPx ?? first.offsetX ?? 0))) * mPerPx / dt) : 0;
    const vy = previous && dt > 0 ? -((dyPx - (Number(previous.dyPx ?? previous.offsetY ?? 0) - Number(first.dyPx ?? first.offsetY ?? 0))) * mPerPx / dt) : 0;
    const speed = Math.hypot(vx, vy); const valid = motion.valid !== false && !motion.errorCode;
    return { frameIndex: index, timeS, velocityMps: valid ? speed : 0, velocityKmh: valid ? speed * 3.6 : 0, directionDeg: valid ? Math.atan2(vy, vx) * 180 / Math.PI : 0, confidence: Number(motion.score ?? .9), valid, errorCode: motion.errorCode || null, dxPx, dyPx, vxMps: vx, vyMps: vy };
  });
  const valid = samples.filter((sample) => sample.valid); const speeds = valid.map((sample) => sample.velocityMps); const latest = valid.at(-1) || samples.at(-1);
  const mean = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  return { schemaVersion: CONTRACTS.schemaVersion, velocityMps: latest?.velocityMps || 0, velocityKmh: latest?.velocityKmh || 0, directionDeg: latest?.directionDeg || 0, meanSpeedMps: mean, peakSpeedMps: speeds.length ? Math.max(...speeds) : 0, validRatio: samples.length ? valid.length / samples.length : 0, samples, diagnostics: { inlierCount: Math.max(...motions.map((m) => Number(m.inlierCount || 0))), inlierRatio: Math.min(...motions.map((m) => Number(m.inlierRatio ?? 1))), medianReprojectionErrorPx: Math.max(...motions.map((m) => Number(m.medianReprojectionErrorPx || 0))), forwardBackwardErrorPx: 0, trackedPointCount: Math.max(...motions.map((m) => Number(m.inlierCount || 0))), cameraStable: motions.every((m) => m.cameraStable !== false), sceneTextureScore: .8, validRatio: valid.length / Math.max(1, samples.length), failureIntervals: [], method: 'lk-ransac-affine' }, scale: { ...scale, realDistanceM: scale.realDistance * ({ mm: .001, cm: .01, m: 1 }[scale.unit] || 1) } };
}
