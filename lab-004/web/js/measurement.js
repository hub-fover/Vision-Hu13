import { metresPerPixel, validateTarget, CONTRACTS } from './contracts.js';
import { dominantFrequency, summarize } from './signal.js';
import { trackTemplateSequence } from './template.js';
import { trackFlowSequence } from './flow.js';

const SAMPLE_LAYOUT = Object.freeze({
  width: 640,
  height: 360,
  grid: 32,
  targetX: 220,
  targetY: 110,
  targetWidth: 180,
  targetHeight: 120,
});

function colour(value) {
  const match = String(value).match(/#([0-9a-f]{6})/i);
  if (!match) return [255, 255, 255, 255];
  const hex = match[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
}

function fallbackCanvas(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const context = {
    fillStyle: '#000000', strokeStyle: '#ffffff', lineWidth: 1,
    fillRect(x, y, w, h) {
      const [r, g, b, a] = colour(this.fillStyle);
      const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y));
      const right = Math.min(width, Math.ceil(x + w)), bottom = Math.min(height, Math.ceil(y + h));
      for (let py = top; py < bottom; py += 1) for (let px = left; px < right; px += 1) {
        const i = (py * width + px) * 4; pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
      }
    },
    clearRect(x, y, w, h) { this.fillStyle = '#000000'; this.fillRect(x, y, w, h); },
    beginPath() { this.path = []; }, moveTo(x, y) { this.path?.push([x, y]); }, lineTo(x, y) { this.path?.push([x, y]); },
    stroke() {
      const points = this.path || []; const old = this.fillStyle; this.fillStyle = this.strokeStyle;
      for (let p = 1; p < points.length; p += 1) { const [x1, y1] = points[p - 1]; const [x2, y2] = points[p]; const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        for (let j = 0; j <= n; j += 1) this.fillRect(x1 + (x2 - x1) * j / Math.max(1, n), y1 + (y2 - y1) * j / Math.max(1, n), this.lineWidth, this.lineWidth); }
      this.fillStyle = old;
    },
    fillText(text, x, y) { const chars = String(text); for (let c = 0; c < chars.length; c += 1) { const code = chars.charCodeAt(c); for (let bit = 0; bit < 8; bit += 1) if (code & (1 << bit)) this.fillRect(x + c * 5 + (bit % 3), y + Math.floor(bit / 3), 2, 2); } },
    getImageData() { return { data: pixels.slice() }; },
  };
  return { width, height, getContext: () => context, _pixels: pixels };
}

function makeCanvas(width, height) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
  }
  return fallbackCanvas(width, height);
}

function sampleMotionAt(index, fps) {
  const phase = 2 * Math.PI * 2 * index / fps;
  return {
    offsetX: Math.sin(phase) * 3,
    offsetY: Math.cos(phase) * 0.8,
    score: 0.94,
  };
}

function renderSampleFrame(canvas, offsetX, offsetY, index) {
  const context = canvas.getContext('2d');
  const { width, height, grid, targetX, targetY, targetWidth, targetHeight } = SAMPLE_LAYOUT;
  context.fillStyle = '#101923'; context.fillRect(0, 0, width, height);
  context.strokeStyle = '#263747'; context.lineWidth = 1;
  for (let x = 0; x <= width; x += grid) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  for (let y = 0; y <= height; y += grid) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  const x = targetX + offsetX; const y = targetY + offsetY;
  context.fillStyle = '#254d61'; context.fillRect(x, y, targetWidth, targetHeight);
  context.fillStyle = '#82e4d2'; context.fillRect(x + 2, y + 2, targetWidth - 4, 4); context.fillRect(x + 2, y + targetHeight - 6, targetWidth - 4, 4);
  context.fillStyle = '#d8fff6';
  for (let tx = 12; tx < targetWidth - 10; tx += 22) for (let ty = 14; ty < targetHeight - 16; ty += 22) context.fillRect(x + tx, y + ty, 8, 8);
  context.fillStyle = '#f6fffd'; context.fillText(`TARGET ${String(index).padStart(3, '0')}`, x + 16, y + 64);
}

export function buildSampleFrames(count = 240, fps = 30) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const rate = Number(fps) > 0 ? Number(fps) : 30;
  const first = sampleMotionAt(0, rate);
  return Array.from({ length: total }, (_, i) => {
    const motion = sampleMotionAt(i, rate);
    const offsetX = motion.offsetX - first.offsetX;
    const offsetY = motion.offsetY - first.offsetY;
    const canvas = makeCanvas(SAMPLE_LAYOUT.width, SAMPLE_LAYOUT.height);
    renderSampleFrame(canvas, offsetX, offsetY, i);
    return { canvas, source: 'sample', timeS: i / rate, offsetX, offsetY, score: motion.score };
  });
}

export function buildSampleMotion(count = 240, fps = 30) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const rate = Number(fps) > 0 ? Number(fps) : 30;
  return Array.from({ length: total }, (_, i) => sampleMotionAt(i, rate));
}
export function measureMotions(motions,{roi,scale,method='template',fps=30}={}){if(!Array.isArray(motions)||!motions.length)throw Object.assign(new Error('INVALID_FRAME'),{code:'INVALID_FRAME'});validateTarget(roi||{x:0,y:0,width:64,height:64},Math.max(roi?.x+roi?.width||0,640),Math.max(roi?.y+roi?.height||0,360));if(!scale?.p1||!scale?.p2)throw Object.assign(new Error('INVALID_SCALE'),{code:'INVALID_SCALE'});const mPerPx=metresPerPixel(scale.p1,scale.p2,scale.realDistance,scale.unit);const pixelSamples=(method==='flow'?trackFlowSequence:trackTemplateSequence)(motions,fps);const samples=pixelSamples.map(s=>({...s,dxM:s.dxPx*mPerPx,dyM:s.dyPx*mPerPx}));const magnitudes=samples.filter(s=>s.valid).map(s=>Math.hypot(s.dxPx,s.dyPx));const stats=summarize(magnitudes,mPerPx);const times=samples.map(s=>s.timeS),freq=dominantFrequency(times,samples.map(s=>s.dxM));return {schemaVersion:CONTRACTS.schemaVersion,method,scale:{...scale,realDistanceM:scale.realDistance*(scale.unit==='mm'?.001:scale.unit==='cm'?.01:1)},displacement:{samples,peakToPeakM:stats.peakToPeakM,rmsM:stats.rmsM,peakToPeakPx:magnitudes.length?Math.max(...magnitudes)-Math.min(...magnitudes):0},spectrum:freq,diagnostics:{cameraStable:true,backgroundTrackable:true,validRatio:samples.filter(s=>s.valid).length/samples.length,meanScore:samples.reduce((a,s)=>a+s.score,0)/samples.length,fps,errorCode:null},errors:[]};}
