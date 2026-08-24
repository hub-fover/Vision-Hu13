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

export const SAMPLE_SCENARIOS = Object.freeze({
  'synthetic-sine-2hz': { label: '桌面小幅振动（默认）', description: '确定性正弦运动 · 2 Hz · 3 px', badge: '30 fps · 2 Hz' },
  'car-speed': { label: '汽车横向移动（生成）', description: '二维横向位移 · 约 4 px/s · 非实拍', badge: '30 fps · 线性' },
  'bridge-vibration': { label: '桥梁垂向振动（生成）', description: '垂向振动 · 1.2 Hz · 4 px · 非实拍', badge: '30 fps · 1.2 Hz' },
  'airplane-trajectory': { label: '飞机二维轨迹（生成）', description: '二维投影轨迹 · 非实拍，不代表三维速度', badge: '30 fps · 轨迹' },
  'phone-pan-speed': { label: '手机横向移动（静止场景）', description: '静止纹理整体滑动 · 参考速度 · 非实拍', badge: '30 fps · 光流 + RANSAC' },
});

function sampleMotionAt(index, fps, scenarioId = 'synthetic-sine-2hz') {
  const t = index / fps;
  const phase = 2 * Math.PI * 2 * t;
  if (scenarioId === 'car-speed') return { offsetX: 4 * t, offsetY: 0.25 * Math.sin(phase * 0.5), score: 0.93 };
  if (scenarioId === 'bridge-vibration') return { offsetX: 0.25 * Math.sin(phase), offsetY: 4 * Math.sin(2 * Math.PI * 1.2 * t), score: 0.92 };
  if (scenarioId === 'airplane-trajectory') return { offsetX: 3 * t, offsetY: -1.2 * t + 0.6 * Math.sin(phase * 0.35), score: 0.91 };
  if (scenarioId === 'phone-pan-speed') return { offsetX: -6 * t, offsetY: 0.15 * Math.sin(phase * 0.25), score: 0.93, motionModel: 'lk-ransac-affine', inlierCount: 96, inlierRatio: 0.92, medianReprojectionErrorPx: 0.48 };
  return { offsetX: Math.sin(phase) * 3, offsetY: Math.cos(phase) * 0.8, score: 0.94 };
}

function renderSampleFrame(canvas, offsetX, offsetY, index, scenarioId = 'synthetic-sine-2hz') {
  const context = canvas.getContext('2d');
  const { width, height, grid, targetX, targetY, targetWidth, targetHeight } = SAMPLE_LAYOUT;
  context.fillStyle = scenarioId === 'airplane-trajectory' ? '#9ec8df' : scenarioId === 'bridge-vibration' ? '#b7c6c8' : '#101923'; context.fillRect(0, 0, width, height);
  context.strokeStyle = scenarioId === 'bridge-vibration' ? '#87999b' : '#263747'; context.lineWidth = 1;
  for (let x = 0; x <= width; x += grid) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  for (let y = 0; y <= height; y += grid) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  if (scenarioId === 'car-speed') { context.fillStyle = '#45484a'; context.fillRect(0, 240, width, 120); for (let x = -50; x < width; x += 100) { context.fillStyle = '#d7d4c9'; context.fillRect(x, 300, 48, 4); } }
  if (scenarioId === 'bridge-vibration') { context.fillStyle = '#667477'; context.fillRect(0, 220, width, 18); for (let x = 70; x < width; x += 90) { context.fillStyle = '#4e5b5d'; context.fillRect(x, 220, 8, 120); } }
  if (scenarioId === 'airplane-trajectory') { context.fillStyle = '#e8f1f2'; context.fillRect(0, 272, width, 2); }
  const x = targetX + offsetX; const y = targetY + offsetY;
  context.fillStyle = scenarioId === 'car-speed' ? '#3c87bd' : scenarioId === 'bridge-vibration' ? '#d77a4f' : scenarioId === 'airplane-trajectory' ? '#f4f3ed' : '#254d61'; context.fillRect(x, y, targetWidth, targetHeight);
  context.fillStyle = '#82e4d2'; context.fillRect(x + 2, y + 2, targetWidth - 4, 4); context.fillRect(x + 2, y + targetHeight - 6, targetWidth - 4, 4);
  context.fillStyle = '#d8fff6';
  for (let tx = 12; tx < targetWidth - 10; tx += 22) for (let ty = 14; ty < targetHeight - 16; ty += 22) context.fillRect(x + tx, y + ty, 8, 8);
  context.fillStyle = '#f6fffd'; context.fillText(`${SAMPLE_SCENARIOS[scenarioId]?.label || 'TARGET'} ${String(index).padStart(3, '0')}`, x + 16, y + 64);
}

export function buildSampleFrames(count = 240, fps = 30, scenarioId = 'synthetic-sine-2hz') {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const rate = Number(fps) > 0 ? Number(fps) : 30;
  const scenario = SAMPLE_SCENARIOS[scenarioId] ? scenarioId : 'synthetic-sine-2hz';
  const first = sampleMotionAt(0, rate, scenario);
  return Array.from({ length: total }, (_, i) => {
    const motion = sampleMotionAt(i, rate, scenario);
    const offsetX = motion.offsetX - first.offsetX;
    const offsetY = motion.offsetY - first.offsetY;
    const canvas = makeCanvas(SAMPLE_LAYOUT.width, SAMPLE_LAYOUT.height);
    renderSampleFrame(canvas, offsetX, offsetY, i, scenario);
    return { canvas, source: 'sample', scenarioId: scenario, timeS: i / rate, offsetX, offsetY, score: motion.score };
  });
}

export function buildSampleMotion(count = 240, fps = 30, scenarioId = 'synthetic-sine-2hz') {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const rate = Number(fps) > 0 ? Number(fps) : 30;
  const scenario = SAMPLE_SCENARIOS[scenarioId] ? scenarioId : 'synthetic-sine-2hz';
  return Array.from({ length: total }, (_, i) => ({ ...sampleMotionAt(i, rate, scenario), scenarioId: scenario }));
}
function frequencySignal(samples) {
  const x = samples.map((sample) => Number(sample.dxM) || 0);
  const y = samples.map((sample) => Number(sample.dyM) || 0);
  const variance = (values) => { const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); return values.reduce((sum, value) => sum + (value - mean) ** 2, 0); };
  return variance(y) > variance(x) ? y : x;
}
export function measureMotions(motions,{roi,scale,method='template',fps=30}={}){
  if(!Array.isArray(motions)||!motions.length)throw Object.assign(new Error('INVALID_FRAME'),{code:'INVALID_FRAME'});
  validateTarget(roi||{x:0,y:0,width:64,height:64},Math.max(roi?.x+roi?.width||0,640),Math.max(roi?.y+roi?.height||0,360));
  if(!scale?.p1||!scale?.p2)throw Object.assign(new Error('INVALID_SCALE'),{code:'INVALID_SCALE'});
  const mPerPx=metresPerPixel(scale.p1,scale.p2,scale.realDistance,scale.unit);
  const speedMode=method==='camera-speed';
  const pixelSamples=speedMode
    ? motions.map((motion,index)=>({
      frameIndex:index,
      timeS:Number.isFinite(motion.timeS)?motion.timeS:index/fps,
      dxPx:Number(motion.offsetX||0)-Number(motions[0].offsetX||0),
      dyPx:Number(motion.offsetY||0)-Number(motions[0].offsetY||0),
      score:Number.isFinite(motion.score)?motion.score:0,
      valid:motion.errorCode==null&&Number(motion.score||0)>=.55,
      errorCode:motion.errorCode||null,
      motionModel:motion.motionModel||'lk-ransac-affine',
      inlierCount:Number(motion.inlierCount||0),
      inlierRatio:Number(motion.inlierRatio||0),
      medianReprojectionErrorPx:Number(motion.medianReprojectionErrorPx||0),
    }))
    : (method==='flow'?trackFlowSequence(motions,fps):trackTemplateSequence(motions,fps,{allowCameraMotion:false}));
  const samples=pixelSamples.map(s=>({...s,dxM:s.dxPx*mPerPx,dyM:s.dyPx*mPerPx}));
  const magnitudes=samples.filter(s=>s.valid).map(s=>Math.hypot(s.dxPx,s.dyPx));
  const stats=summarize(magnitudes,mPerPx);
  const times=samples.map(s=>s.timeS);
  const errorCode=samples.find(s=>s.errorCode)?.errorCode||null;
  const freq=speedMode||samples.some(s=>s.errorCode==='CAMERA_MOVED'||s.errorCode==='BACKGROUND_UNTRACKABLE')?null:dominantFrequency(times,frequencySignal(samples));
  const cameraStable=speedMode||!samples.some(s=>s.errorCode==='CAMERA_MOVED');
  const backgroundTrackable=speedMode||!samples.some(s=>s.errorCode==='BACKGROUND_UNTRACKABLE');
  let velocity=null;
  if(speedMode){
    const speedSamples=[]; const speeds=[];
    for(let i=0;i<samples.length;i+=1){
      const previous=samples[i-1], current=samples[i];
      if(i===0||!previous?.valid||!current.valid||!(current.timeS>previous.timeS)){speedSamples.push({frameIndex:current.frameIndex,timeS:current.timeS,vxMps:0,vyMps:0,speedMps:0,valid:false,errorCode:current.errorCode||'FPS_UNSTABLE'});continue;}
      const dt=current.timeS-previous.timeS, vx=-(current.dxM-previous.dxM)/dt, vy=-(current.dyM-previous.dyM)/dt, speed=Math.hypot(vx,vy);
      speedSamples.push({frameIndex:current.frameIndex,timeS:current.timeS,vxMps:vx,vyMps:vy,speedMps:speed,valid:true,errorCode:null}); speeds.push(speed);
    }
    velocity={samples:speedSamples,meanSpeedMps:speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:0,peakSpeedMps:speeds.length?Math.max(...speeds):0,quality:'reference-only'};
  }
  const motionMetrics=speedMode?samples.filter(s=>s.motionModel).at(-1):null;
  return {schemaVersion:CONTRACTS.schemaVersion,method,scale:{...scale,realDistanceM:scale.realDistance*(scale.unit==='mm'?.001:scale.unit==='cm'?.01:1)},displacement:{samples,peakToPeakM:stats.peakToPeakM,rmsM:stats.rmsM,peakToPeakPx:magnitudes.length?Math.max(...magnitudes)-Math.min(...magnitudes):0},spectrum:freq,velocity,diagnostics:{cameraStable,backgroundTrackable,validRatio:samples.filter(s=>s.valid).length/samples.length,meanScore:samples.reduce((a,s)=>a+s.score,0)/samples.length,fps,errorCode,motionModel:motionMetrics?.motionModel||null,inlierCount:motionMetrics?.inlierCount||0,inlierRatio:motionMetrics?.inlierRatio||0,medianReprojectionErrorPx:motionMetrics?.medianReprojectionErrorPx||0},errors:errorCode?[errorCode]:[]};
}
