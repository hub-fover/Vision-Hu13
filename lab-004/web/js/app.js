import { createState, reducer, MODES } from './state.js';
import { requestRearCamera, imageFrame, videoFrames, motionFromFrames, captureLiveFrames } from './capture.js';
import { buildSampleMotion, buildSampleFrames } from './measurement.js';
import { drawSeries } from './signal.js';
import { describeError } from './errors.js';
import { WorkerClient } from './worker-client.js';
import { moveRoi, nearestRoiHandle, resizeRoi, roiContains } from './editor.js';
import { createAnnotatedVideo, replaceVideoUrl, releaseVideoUrl } from './video.js';

const $ = (id) => document.getElementById(id);
let state = createState();
let stream = null;
let worker = null;
let requestId = null;
let editorPoints = [];
let editorFrame = null;
let editMode = 'roi';
let drag = null;
let captureToken = 0;
let frameUrls = [];
let resultVideoUrl = null;
let resultVideoBlob = null;
let resultVideoFrames = [];
let statusMessage = '加载样例后，这里会显示像素位移、毫米位移和主频。';

function releaseFrameUrls() {
  frameUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} });
  frameUrls = [];
}

function cloneFrame(frame, source = 'camera-reference') {
  const canvas = document.createElement('canvas');
  canvas.width = frame?.canvas?.width || 640;
  canvas.height = frame?.canvas?.height || 360;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (frame?.canvas) context.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height);
  return { canvas, source, timeS: 0 };
}

function setStatus(message) {
  statusMessage = message;
  const element = $('status');
  if (element && !state.error) element.textContent = message;
}

function cancelActiveWork() {
  captureToken += 1;
  if (requestId) worker?.cancel(requestId);
  requestId = null;
  clearResultVideo();
}

function stopStream() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  $('cameraVideo').srcObject = null;
  $('startCamera').disabled = false;
  $('freezeCamera').disabled = true;
  $('stopCamera').disabled = true;
}

function dispatch(action) {
  state = reducer(state, action);
  render();
}

function scaleReference() {
  return {
    p1: editorPoints[0] || state.scale.p1,
    p2: editorPoints[1] || state.scale.p2,
    realDistance: Number($('scaleInput').value),
    unit: $('unitInput').value,
  };
}

function scalePixels() {
  const scale = scaleReference();
  return Math.hypot(scale.p2[0] - scale.p1[0], scale.p2[1] - scale.p1[1]);
}

function inputReady() {
  const hasInput = state.mode === MODES.LIVE ? Boolean(editorFrame) : state.frames.length > 1;
  return hasInput && editorPoints.length === 2 && Number.isFinite(Number($('scaleInput').value)) &&
    Number($('scaleInput').value) > 0 && scalePixels() >= 40 &&
    state.roi.width >= 64 && state.roi.height >= 64;
}

function updateSetupChecklist() {
  const checklist = $('setupChecklist');
  if (!checklist) return;
  const missing = [];
  if ((state.mode === MODES.LIVE ? !editorFrame : state.frames.length < 2)) missing.push(state.mode === MODES.LIVE ? '先加载样例，或启动相机并冻结首帧' : '先加载样例，或导入至少两帧照片/一段视频');
  if (editorPoints.length !== 2) missing.push('切换到“设置两点标尺”，点击 P1 和 P2');
  if (!Number.isFinite(Number($('scaleInput').value)) || Number($('scaleInput').value) <= 0) missing.push('输入两点之间的真实距离');
  if (editorPoints.length === 2 && scalePixels() < 40) missing.push('把 P1、P2 拉开至少 40 像素');
  checklist.textContent = missing.length ? `还差：${missing.join('；')}` : '已就绪：相机保持不动后，点击“开始测量”。';
}

function render() {
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('samplePanel').classList.toggle('hidden', state.mode !== MODES.SAMPLE);
  $('livePanel').classList.toggle('hidden', state.mode !== MODES.LIVE);
  $('measureButton').disabled = !inputReady() || state.status === 'running';
  $('cancelButton').disabled = state.status !== 'running';
  $('sampleButton').disabled = state.status === 'running';
  const editingDisabled = state.status === 'running';
  ['roiMode', 'scaleMode', 'clearScale', 'scaleInput', 'unitInput', 'methodInput'].forEach((id) => { if ($(id)) $(id).disabled = editingDisabled; });
  document.querySelectorAll('input[type="file"]').forEach((input) => {
    input.disabled = state.status === 'running';
    input.closest('.file-button')?.classList.toggle('is-disabled', state.status === 'running');
  });
  $('setupState').textContent = state.frames.length > 1 ? `${state.frames.length} 帧已加载` : '等待输入';
  $('statusPill').textContent = state.status === 'success' ? '已完成' : state.status === 'running' ? '计算中' : state.error ? '需重新设置' : '未开始';
  $('status').textContent = state.error ? describeError(state.error) : statusMessage;
  updateSetupChecklist();
  if (state.result) renderResult(state.result); else clearResultView();
}

function clearResultView() {
  $('metricDisplacement').textContent = '—'; $('metricFrequency').textContent = '—'; $('metricFps').textContent = '—'; $('metricValid').textContent = '—';
  $('readoutX').textContent = '—'; $('readoutY').textContent = '—'; $('readoutMagnitude').textContent = '—'; $('readoutScore').textContent = '—'; $('readoutCamera').textContent = '待检';
  $('chartEmpty').classList.remove('hidden'); drawSeries($('displacementChart'), []);
  ['downloadCsv', 'downloadJson', 'shareResult'].forEach((id) => { $(id).disabled = true; });
  clearResultVideo();
}

function clearResultVideo() {
  const video = $('motionVideo');
  if (resultVideoUrl) releaseVideoUrl(resultVideoUrl);
  resultVideoUrl = null;
  resultVideoBlob = null;
  resultVideoFrames = [];
  if (video) {
    video.pause?.();
    video.removeAttribute('src');
    video.load?.();
  }
  const panel = $('resultVideoPanel');
  if (panel) panel.classList.add('hidden');
  const status = $('videoStatus');
  if (status) status.textContent = '测量完成后生成带 Δx、Δy 和位移标注的结果视频。';
  const button = $('downloadVideo');
  if (button) button.disabled = true;
}

function renderResult(result) {
  const mm = result.displacement.peakToPeakM * 1000;
  $('status').textContent = '跟踪完成。相机保持稳定，下面的数值是参考级估计。';
  $('metricDisplacement').textContent = `${mm.toFixed(2)} mm`;
  $('metricFrequency').textContent = result.spectrum ? result.spectrum.frequencyHz.toFixed(2) : '—';
  $('metricFps').textContent = Number(result.diagnostics.fps).toFixed(1);
  $('metricValid').textContent = `${(result.diagnostics.validRatio * 100).toFixed(0)}%`;
  $('chartEmpty').classList.toggle('hidden', result.displacement.samples.length >= 128);
  drawSeries($('displacementChart'), result.displacement.samples);
  const last = result.displacement.samples.at(-1);
  if (last) {
    $('readoutX').textContent = `${(last.dxM * 1000).toFixed(2)} mm`;
    $('readoutY').textContent = `${(last.dyM * 1000).toFixed(2)} mm`;
    $('readoutMagnitude').textContent = `${(Math.hypot(last.dxM, last.dyM) * 1000).toFixed(2)} mm`;
    $('readoutScore').textContent = last.score.toFixed(2);
    $('readoutCamera').textContent = result.diagnostics.cameraStable ? '稳定' : '移动';
  }
  ['downloadCsv', 'downloadJson', 'shareResult'].forEach((id) => { $(id).disabled = false; });
  $('resultVideoPanel').classList.remove('hidden');
}

function drawEditor() {
  const canvas = $('targetCanvas');
  canvas.dataset.editMode = editMode;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#18313a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (editorFrame) {
    ctx.drawImage(editorFrame, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.strokeStyle = '#48666c';
    for (let x = 0; x < canvas.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }
  const r = state.roi;
  ctx.fillStyle = '#4f9c92'; ctx.globalAlpha = 0.28; ctx.fillRect(r.x, r.y, r.width, r.height); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#82e4d2'; ctx.lineWidth = 3; ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.fillStyle = '#d7fff6'; ctx.strokeStyle = '#17363b'; ctx.lineWidth = 2;
  [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  ctx.font = '700 12px system-ui';
  editorPoints.forEach((point, index) => {
    ctx.fillStyle = '#f2c879'; ctx.beginPath(); ctx.arc(point[0], point[1], 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#18313a'; ctx.fillText(`P${index + 1}`, point[0] + 11, point[1] - 10);
  });
  $('editorHint').textContent = editMode === 'roi' ? '按住圆点拖动四角，框内可整体移动；手机上圆点周围一小圈也可抓取' : '点击设置 P1、P2；拖动圆点可微调，需相距至少 40 像素';
}

function pointerPoint(event) {
  const rect = $('targetCanvas').getBoundingClientRect();
  return [(event.clientX - rect.left) * 640 / rect.width, (event.clientY - rect.top) * 360 / rect.height];
}

function pointIndex(point) {
  let best = -1, distance = 28;
  editorPoints.forEach(([x, y], index) => { const d = Math.hypot(point[0] - x, point[1] - y); if (d < distance) { distance = d; best = index; } });
  return best;
}

function setEditorPoint(point) {
  const index = pointIndex(point);
  if (index >= 0) { drag = { type: 'scale', index }; return; }
  const next = editorPoints.length >= 2 ? 0 : editorPoints.length;
  editorPoints[next] = [Math.round(point[0]), Math.round(point[1])];
  drag = { type: 'scale', index: next };
  dispatch({ type: 'SET_SCALE', scale: scaleReference() });
  drawEditor();
}

const editor = $('targetCanvas');
editor.addEventListener('pointerdown', (event) => {
  if (state.status === 'running') return;
  event.preventDefault(); editor.setPointerCapture(event.pointerId); const point = pointerPoint(event);
  if (editMode === 'scale') { setEditorPoint(point); return; }
  const r = state.roi;
  const handle = nearestRoiHandle({ x: point[0], y: point[1] }, r);
  if (handle >= 0) drag = { type: 'roi-handle', handle, start: point, roi: { ...r } };
  else if (roiContains({ x: point[0], y: point[1] }, r)) drag = { type: 'roi-move', start: point, roi: { ...r } };
  if (drag?.type?.startsWith('roi')) editor.style.cursor = 'grabbing';
});
editor.addEventListener('pointermove', (event) => {
  if (!drag) return; const point = pointerPoint(event);
  if (drag.type === 'scale') { editorPoints[drag.index] = [Math.round(point[0]), Math.round(point[1])]; dispatch({ type: 'SET_SCALE', scale: scaleReference() }); drawEditor(); return; }
  const dx = point[0] - drag.start[0], dy = point[1] - drag.start[1];
  const next = drag.type === 'roi-move' ? moveRoi(drag.roi, { x: dx, y: dy }) : resizeRoi(drag.roi, drag.handle, { x: dx, y: dy });
  dispatch({ type: 'SET_ROI', roi: next }); drag.roi = next; drag.start = point; drawEditor();
});
['pointerup', 'pointercancel'].forEach((type) => editor.addEventListener(type, () => { const finished = drag; drag = null; editor.style.cursor = ''; if (finished?.type === 'roi-handle' || finished?.type === 'roi-move') setStatus('目标框已更新，确认框住目标后再测量。'); if (finished?.type === 'scale') setStatus('标尺点已更新，输入两点之间的真实距离。'); }));

function updateScale() { dispatch({ type: 'SET_SCALE', scale: scaleReference() }); setStatus('标尺已更新，确认两点和真实距离后可以重新测量。'); }

async function createResultVideo(frames, result, token, fps, roi, scale) {
  const panel = $('resultVideoPanel');
  if (!panel || !Array.isArray(frames) || frames.length < 2) return;
  panel.classList.remove('hidden');
  $('videoStatus').textContent = '正在生成逐帧标注视频……';
  $('downloadVideo').disabled = true;
  resultVideoFrames = frames;
  try {
    const blob = await createAnnotatedVideo(frames, result.displacement.samples, roi, fps, {
      scale,
      shouldCancel: () => token !== captureToken,
    });
    if (token !== captureToken || state.result !== result) return;
    resultVideoBlob = blob;
    resultVideoUrl = replaceVideoUrl($('motionVideo'), blob);
    $('motionVideo').load?.();
    $('downloadVideo').disabled = false;
    $('videoStatus').textContent = '已生成：每一帧都标出相对于初始帧的 Δx、Δy 和位移。';
  } catch (error) {
    if (token !== captureToken || error?.code === 'CANCELLED' || error?.code === 'VIDEO_RECORDING_CANCELLED') return;
    $('videoStatus').textContent = describeError(error);
    $('downloadVideo').disabled = true;
  } finally {
    resultVideoFrames = [];
  }
}

async function runMeasure() {
  const token = ++captureToken;
  const roiSnapshot = { ...state.roi };
  const scaleSnapshot = scaleReference();
  const methodSnapshot = $('methodInput').value;
  clearResultVideo();
  dispatch({ type: 'RUNNING' });
  try {
    worker ??= new WorkerClient();
    let motions;
    let videoFramesForResult;
    let fpsForRun = state.fps;
    if (state.mode === MODES.LIVE && stream) {
      const captured = await captureLiveFrames($('cameraVideo'), { shouldCancel: () => token !== captureToken, onProgress: (value) => setStatus(`正在采集画面……${Math.round(value * 100)}%`) });
      if (!captured.frames || captured.frames.length < 1 || !editorFrame) throw Object.assign(new Error('INVALID_FRAME'), { code: 'INVALID_FRAME' });
      fpsForRun = captured.fps;
      const frameStep = 1 / Math.max(1, fpsForRun);
      const reference = cloneFrame({ canvas: editorFrame }, 'camera-reference');
      const followup = captured.frames.map((frame) => ({ ...frame, timeS: Number.isFinite(Number(frame.timeS)) ? Number(frame.timeS) + frameStep : frameStep }));
      videoFramesForResult = [reference, ...followup];
      motions = motionFromFrames(videoFramesForResult, roiSnapshot, fpsForRun);
      state = { ...state, fps: fpsForRun };
    } else if (state.mode === MODES.SAMPLE) {
      videoFramesForResult = state.frames[0]?.source === 'sample' ? state.frames : buildSampleFrames(state.frames.length || 240, state.fps);
      motions = buildSampleMotion(videoFramesForResult.length, fpsForRun);
    } else {
      videoFramesForResult = state.frames;
      if (!Array.isArray(videoFramesForResult) || videoFramesForResult.length < 2) throw Object.assign(new Error('INVALID_FRAME'), { code: 'INVALID_FRAME' });
      motions = videoFramesForResult[0]?.canvas ? motionFromFrames(videoFramesForResult, roiSnapshot, fpsForRun) : videoFramesForResult;
    }
    if (token !== captureToken) throw Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' });
    requestId = worker.seq + 1;
    const result = await worker.request('measure', { motions, roi: roiSnapshot, scale: scaleSnapshot, method: methodSnapshot, fps: fpsForRun });
    if (token !== captureToken) throw Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' });
    dispatch({ type: 'RESULT', result });
    await createResultVideo(videoFramesForResult, result, token, fpsForRun, roiSnapshot, scaleSnapshot);
  } catch (error) { if (error?.code !== 'CANCELLED' || token === captureToken) dispatch({ type: 'ERROR', error }); } finally { requestId = null; }
}

async function handleFiles(fileList) {
  const files = [...fileList]; if (!files.length) return;
  let inputToken = captureToken;
  try {
    cancelActiveWork();
    inputToken = captureToken;
    if (stream) stopStream();
    releaseFrameUrls();
    editorPoints = []; editorFrame = null; $('scaleInput').value = ''; dispatch({ type: 'CLEAR' }); setStatus('正在读取本地素材……');
    if (files[0].type.startsWith('video/')) {
      if (files.length > 1) setStatus('检测到视频，将只读取第一段视频。');
      const result = await videoFrames(files[0], { onProgress: (value) => setStatus(`正在抽取视频帧……${Math.round(value * 100)}%`) });
      if (inputToken !== captureToken) { releaseVideoUrl(result.url); releaseFrameUrls(); return; }
      editorFrame = result.frames[0].canvas; frameUrls.push(result.url); dispatch({ type: 'SET_FRAMES', frames: result.frames }); state = { ...state, fps: result.fps }; setStatus(`已读取 ${result.frames.length} 帧，帧率约 ${result.fps.toFixed(1)} fps。`);
    } else {
      const frames = [];
      const imageFiles = files.slice(0, 150);
      for (let index = 0; index < imageFiles.length; index += 1) {
        const frame = await imageFrame(imageFiles[index]);
        if (inputToken !== captureToken) { if (frame.url) releaseVideoUrl(frame.url); releaseFrameUrls(); return; }
        frames.push(frame);
        if (frame.url) frameUrls.push(frame.url);
        setStatus(`正在读取照片……${index + 1}/${imageFiles.length}`);
      }
      editorFrame = frames[0].canvas;
      if (frames.length < 2) { dispatch({ type: 'CLEAR' }); setStatus('单张照片只能用于设置 ROI。请至少选择两张连续照片，或选择一段视频。'); }
      else { dispatch({ type: 'SET_FRAMES', frames }); setStatus(`已读取 ${frames.length} 张照片，将按文件顺序估计位移。`); }
    }
    drawEditor(); updateSetupChecklist();
  } catch (error) { releaseFrameUrls(); if (inputToken !== captureToken) return; dispatch({ type: 'ERROR', error: Object.assign(error, { code: error.code || 'DECODE_FAILED' }) }); }
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { cancelActiveWork(); releaseFrameUrls(); if (button.dataset.mode !== MODES.LIVE) stopStream(); editorPoints = []; editorFrame = null; $('scaleInput').value = ''; dispatch({ type: 'SET_MODE', mode: button.dataset.mode }); drawEditor(); setStatus(button.dataset.mode === MODES.LIVE ? '先启动后置相机并冻结首帧，再设置目标框和标尺。' : '点击“用样例体验”，或导入一段视频/至少两张照片。'); }));
$('sampleButton').addEventListener('click', () => { cancelActiveWork(); releaseFrameUrls(); stopStream(); const frames = buildSampleFrames(240, 30); editorFrame = frames[0].canvas; editorPoints = [[120, 100], [280, 100]]; $('scaleInput').value = '100'; dispatch({ type: 'SET_FPS', fps: 30 }); dispatch({ type: 'SET_SCALE', scale: scaleReference() }); dispatch({ type: 'SET_FRAMES', frames }); setStatus('样例已准备，正在计算 2 Hz 位移。'); drawEditor(); runMeasure(); });
$('fileInput').addEventListener('change', (event) => { handleFiles(event.target.files); event.target.value = ''; }); $('galleryInput').addEventListener('change', (event) => { handleFiles(event.target.files); event.target.value = ''; });
$('scaleInput').addEventListener('input', updateScale); $('unitInput').addEventListener('change', updateScale); $('methodInput').addEventListener('change', (event) => { dispatch({ type: 'SET_METHOD', method: event.target.value }); setStatus('跟踪方法已更新，确认设置后可以重新测量。'); });
$('roiMode').addEventListener('click', () => { editMode = 'roi'; $('roiMode').setAttribute('aria-pressed', 'true'); $('scaleMode').setAttribute('aria-pressed', 'false'); drawEditor(); setStatus('目标框模式：拖动圆点调整大小，拖动框内可整体移动。'); });
$('scaleMode').addEventListener('click', () => { editMode = 'scale'; $('roiMode').setAttribute('aria-pressed', 'false'); $('scaleMode').setAttribute('aria-pressed', 'true'); drawEditor(); setStatus('标尺模式：点击或拖动 P1、P2，输入它们之间的真实距离。'); });
$('clearScale').addEventListener('click', () => { editorPoints = []; dispatch({ type: 'SET_SCALE', scale: { p1: [0, 0], p2: [0, 0], realDistance: Number($('scaleInput').value), unit: $('unitInput').value } }); drawEditor(); setStatus('标尺点已清除，请重新设置 P1 和 P2。'); }); $('measureButton').addEventListener('click', runMeasure);
$('cancelButton').addEventListener('click', () => { cancelActiveWork(); dispatch({ type: 'ERROR', error: Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' }) }); });
$('startCamera').addEventListener('click', async () => { try { stopStream(); stream = await requestRearCamera(); const video = $('cameraVideo'); video.srcObject = stream; await video.play().catch(() => {}); if (video.readyState < 2) await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true })); $('startCamera').disabled = true; $('freezeCamera').disabled = false; $('stopCamera').disabled = false; setStatus('相机已启动。固定手机后冻结首帧，再设置目标框和尺度点。'); } catch (error) { stopStream(); $('liveStatus').textContent = describeError(error); } });
$('freezeCamera').addEventListener('click', () => { const video = $('cameraVideo'); if (video.readyState < 2 || !video.videoWidth) { $('liveStatus').textContent = '相机画面还没准备好，请稍等一秒再冻结。'; return; } const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; const ctx = canvas.getContext('2d'); const sw = video.videoWidth, sh = video.videoHeight, scale = Math.min(640 / sw, 360 / sh); ctx.fillStyle = '#10252d'; ctx.fillRect(0, 0, 640, 360); ctx.drawImage(video, (640 - sw * scale) / 2, (360 - sh * scale) / 2, sw * scale, sh * scale); editorFrame = canvas; editorPoints = []; dispatch({ type: 'CLEAR' }); $('liveStatus').textContent = '首帧已冻结。先调整目标框，再设置 P1/P2 和真实距离；点击开始后会重新采集后续画面。'; drawEditor(); });
$('stopCamera').addEventListener('click', () => { cancelActiveWork(); releaseFrameUrls(); stopStream(); editorPoints = []; editorFrame = null; $('scaleInput').value = ''; dispatch({ type: 'CLEAR' }); $('liveStatus').textContent = '相机已停止。重新开始后可以再次冻结画面。'; drawEditor(); });

function download(name, text, type) { const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
$('downloadJson').addEventListener('click', () => state.result && download('lab004-measurement.json', JSON.stringify(state.result, null, 2), 'application/json'));
$('downloadCsv').addEventListener('click', () => { if (!state.result) return; const rows = ['frameIndex,timeS,dxPx,dyPx,dxM,dyM,score,valid,errorCode', ...state.result.displacement.samples.map((sample) => [sample.frameIndex, sample.timeS, sample.dxPx, sample.dyPx, sample.dxM, sample.dyM, sample.score, sample.valid, sample.errorCode || ''].join(','))]; download('lab004-displacement.csv', rows.join('\n'), 'text/csv'); });
$('downloadVideo').addEventListener('click', () => { if (!resultVideoBlob) return; const url = URL.createObjectURL(resultVideoBlob); const anchor = document.createElement('a'); const extension = String(resultVideoBlob.type || '').toLowerCase().includes('mp4') ? 'mp4' : 'webm'; anchor.href = url; anchor.download = `lab004-annotated-measurement.${extension}`; anchor.click(); setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 5000); });
$('shareResult').addEventListener('click', async () => { if (!state.result) return; const text = JSON.stringify(state.result); if (navigator.share) try { await navigator.share({ title: 'LAB004 视觉位移测量', text }); return; } catch {} download('lab004-measurement.json', text, 'application/json'); });
window.addEventListener('pagehide', () => { cancelActiveWork(); stopStream(); releaseFrameUrls(); worker?.terminate(); worker = null; });
drawEditor(); render();
