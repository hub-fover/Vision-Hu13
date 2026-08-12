import { createInitialState, moveFrame, readyFrames, resetFrames } from './state.js';
import { addFileToSlot, captureVideoFrame, decodeFile, FOCUS_LABELS, getFocusCapabilities, loadSampleManifest, requestCamera, resolveSampleUrl, setFocusDistance, stopMediaStream } from './capture.js';
import { validateCalibration, validateScale } from './calibration.js';
import { messageFor } from './errors.js';
import { DefocusWorkerClient } from './worker-client.js';

const state = createInitialState();
const client = new DefocusWorkerClient();
const resultUrls = new Set();
const $ = selector => document.querySelector(selector);
const slots = $('#capture-slots');
let cameraStream = null;
let cameraTrack = null;
let focusCapabilities = null;
let cameraRequestToken = 0;

function nextEmptySlot() { return state.frames.findIndex(frame => !(frame.file || frame.bitmap)); }

function releaseCamera() {
  cameraRequestToken += 1;
  stopMediaStream(cameraStream);
  cameraStream = null;
  cameraTrack = null;
  focusCapabilities = null;
  const video = $('#camera-preview');
  if (video) { video.pause?.(); video.srcObject = null; video.hidden = true; }
  const session = $('#camera-session'); if (session) session.hidden = true;
  const focusControl = $('#focus-distance-control'); if (focusControl) focusControl.hidden = true;
  const captureButton = $('#capture-frame'); if (captureButton) captureButton.disabled = true;
}

function setCameraStatus(message) { const node = $('#camera-status'); if (node) node.textContent = message; }

async function startCamera() {
  releaseCamera();
  const token = cameraRequestToken;
  const session = $('#camera-session'); session.hidden = false;
  setCameraStatus('正在请求相机权限…');
  try {
    const stream = await requestCamera();
    if (token !== cameraRequestToken) { stopMediaStream(stream); return; }
    cameraStream = stream; cameraTrack = stream.getVideoTracks?.()[0] || stream.getTracks?.()[0] || null;
    const video = $('#camera-preview'); video.srcObject = stream; video.hidden = false;
    await video.play?.().catch(() => {});
    focusCapabilities = await getFocusCapabilities(cameraTrack);
    const focusControl = $('#focus-distance-control'); const input = $('#focus-distance');
    if (focusCapabilities.supported) {
      focusControl.hidden = false; input.disabled = false; input.min = String(focusCapabilities.min); input.max = String(focusCapabilities.max); input.step = String(focusCapabilities.step || 'any'); input.value = String((focusCapabilities.min + focusCapabilities.max) / 2); $('#focus-distance-value').textContent = input.value;
      setCameraStatus('相机已就绪。可拖动焦点滑杆，按当前焦点拍入下一个空槽。');
    } else {
      focusControl.hidden = true;
      setCameraStatus('相机预览已开启，但浏览器不支持网页调焦；可继续拍当前画面，或改用系统相机后从相册选择五张。');
    }
    const captureButton = $('#capture-frame'); captureButton.disabled = nextEmptySlot() < 0 || !(video.videoWidth || video.clientWidth); video.addEventListener('loadedmetadata', updateReady, { once: true }); updateReady();
  } catch (error) {
    releaseCamera();
    const permission = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    setCameraStatus(permission ? '相机权限被拒绝，请改用下方“从相册选择五张”继续。' : '当前浏览器或设备不支持相机，请改用下方“从相册选择五张”继续。');
    $('#camera-session').hidden = false;
  }
}

async function captureNextFrame() {
  const index = nextEmptySlot();
  if (index < 0 || !cameraStream) return;
  try {
    const file = await captureVideoFrame($('#camera-preview'));
    await addFileToSlot(state, index, file);
    renderSlots(); updateReady();
    const next = nextEmptySlot();
    if (next < 0) { $('#capture-frame').disabled = true; setCameraStatus('五个拍摄位已完成，可以开始分析。'); }
    else setCameraStatus(`已拍入“${FOCUS_LABELS[index]}”，下一张建议：${FOCUS_LABELS[next]}。`);
  } catch (error) { showError(error); }
}

async function applyFocusFromInput(event) {
  if (!cameraTrack || !focusCapabilities?.supported) return;
  const value = Number(event.target.value); $('#focus-distance-value').textContent = String(value);
  try { await setFocusDistance(cameraTrack, value); } catch { setCameraStatus('设备拒绝了网页调焦，请使用系统相机或相册继续。'); }
}

function renderSlots() {
  slots.innerHTML = state.frames.map((frame, index) => `<label class="capture-slot" data-slot="${index}" draggable="${Boolean(frame.file || frame.bitmap)}"><input class="camera-input" type="file" accept="image/*" capture="environment" data-index="${index}"><span class="exposure-mark">${FOCUS_LABELS[index]}</span><span class="slot-action">${frame.file ? '已选择' : '拍摄 / 选择'}</span>${frame.url ? `<img src="${frame.url}" alt="${FOCUS_LABELS[index]}样例">` : ''}${frame.file || frame.bitmap ? `<span class="slot-order"><button type="button" class="move-left" data-from="${index}" data-to="${index - 1}" aria-label="向近焦移动" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" class="move-right" data-from="${index}" data-to="${index + 1}" aria-label="向远焦移动" ${index === 4 ? 'disabled' : ''}>→</button></span>` : ''}</label>`).join('');
  slots.querySelectorAll('.camera-input').forEach(input => input.addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    releaseCamera();
    try { await addFileToSlot(state, Number(input.dataset.index), file); renderSlots(); updateReady(); } catch (error) { showError(error); }
  }));
  slots.querySelectorAll('.slot-order button').forEach(button => button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); moveFrame(state, Number(button.dataset.from), Number(button.dataset.to)); renderSlots(); updateReady(); }));
  slots.querySelectorAll('.capture-slot').forEach(slot => {
    slot.addEventListener('dragstart', event => { event.dataTransfer?.setData('text/plain', slot.dataset.slot); slot.classList.add('dragging'); });
    slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
    slot.addEventListener('dragover', event => { if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; event.preventDefault(); });
    slot.addEventListener('drop', event => { event.preventDefault(); const from = Number(event.dataTransfer?.getData('text/plain')); const to = Number(slot.dataset.slot); if (Number.isInteger(from) && moveFrame(state, from, to)) { renderSlots(); updateReady(); } });
  });
}

function updateReady() {
  const ready = readyFrames(state); $('#run-button').disabled = !ready;
  const video = $('#camera-preview'); const captureButton = $('#capture-frame'); if (captureButton) captureButton.disabled = !cameraStream || nextEmptySlot() < 0 || !(video?.videoWidth || video?.clientWidth);
  $('#analysis-status').textContent = ready ? '五张照片已准备好，可以开始分析。' : `已准备 ${state.frames.filter(frame => frame.file || frame.bitmap).length}/5 张照片`;
}

function showError(error) { const node = $('#error-message'); node.hidden = false; node.textContent = error.code ? `${messageFor(error.code)}${error.detail ? ` ${error.detail}` : ''}` : error.message; }
function clearError() { $('#error-message').hidden = true; $('#error-message').textContent = ''; }
function setProgress(value, stage = '分析中') { $('#progress-panel').hidden = false; $('#progress').value = value; $('#progress-percent').textContent = `${Math.round(value * 100)}%`; $('#progress-stage').textContent = stage; }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
async function bitmapToUrl(bitmap) {
  if (bitmap instanceof Blob) return URL.createObjectURL(bitmap);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Object.assign(new Error('无法生成结果预览'), { code: 'RUNTIME_MISSING' });
  return URL.createObjectURL(blob);
}

function hideResult() {
  $('#result-panel').hidden = true;
  ['result', 'confidence', 'best', 'middle'].forEach(name => $(`#${name}-preview`).removeAttribute('src'));
  resultUrls.forEach(url => URL.revokeObjectURL(url)); resultUrls.clear(); state.result = null;
}

function renderFocusCurve(metrics) {
  const values = Array.from(metrics || []).map(Number).filter(Number.isFinite);
  if (values.length !== 5) {
    $('#focus-curve').querySelector('polyline').setAttribute('points', '');
    $('#focus-curve').querySelector('g').replaceChildren();
    return;
  }
  const max = Math.max(...values, 1e-9); const points = values.map((value, index) => `${20 + index * 90},${105 - value / max * 85}`).join(' ');
  const curve = $('#focus-curve'); curve.querySelector('polyline').setAttribute('points', points);
  curve.querySelector('g').innerHTML = values.map((value, index) => `<circle cx="${20 + index * 90}" cy="${105 - value / max * 85}" r="5" fill="#2f6b4f"><title>${FOCUS_LABELS[index]}：${value.toFixed(5)}</title></circle>`).join('');
}

function resultMetrics(result) {
  const direct = Array.from(result?.globalMetrics || []).map(Number);
  if (direct.length === 5 && direct.every(Number.isFinite)) return direct;
  const curves = result?.curves;
  if (!Array.isArray(curves) || curves.length !== 5) return [];
  return curves.map(curve => {
    const values = Array.from(curve || []).map(Number).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
  });
}

async function displayResult(result) {
  state.result = result; $('#result-panel').hidden = false;
  const [depthUrl, confidenceUrl] = await Promise.all([bitmapToUrl(result.depthBitmap), bitmapToUrl(result.confidenceBitmap)]); resultUrls.add(depthUrl); resultUrls.add(confidenceUrl);
  $('#result-preview').src = depthUrl; $('#confidence-preview').src = confidenceUrl; $('#middle-preview').src = state.frames[2].url;
  const metrics = resultMetrics(result); const bestIndex = metrics.length ? metrics.indexOf(Math.max(...metrics)) : 2; $('#best-preview').src = state.frames[bestIndex].url; renderFocusCurve(metrics);
  const metricText = result.metricDepthM ? '已应用尺度标定，米制值仅供参考。' : '未完成尺度标定，仅显示相对深度。'; const intrinsicsText = result.intrinsicsApplied ? '已应用镜头内参。' : '';
  const alignmentText = result.alignment?.applied ? `已执行五帧轻量平移对齐，最大位移 ${Number(result.alignment.maxErrorPx || 0).toFixed(1)} px。` : '仅完成相机移动筛查。';
  $('#result-summary').textContent = `整体置信度 ${(result.quality * 100).toFixed(0)}%。${intrinsicsText}${metricText}${alignmentText}`;
}

async function runEstimate() {
  releaseCamera(); clearError(); hideResult(); setProgress(0, '读取五张照片');
  // Worker transfers ImageBitmap ownership. Decode fresh working copies so a cancelled or repeated run never reuses detached preview bitmaps.
  const workingFrames = [];
  try {
    for (const frame of state.frames) workingFrames.push(await decodeFile(frame.file));
    const frames = workingFrames.map(decoded => ({ bitmap: decoded.bitmap, width: decoded.width, height: decoded.height }));
    const result = await client.run('estimate', { frames, calibration: state.calibration, scaleCalibration: state.scaleCalibration, options: { tileSize: 8, minTexture: 0.02, minPeakProminence: 0.08, maxAlignmentErrorPx: 2 } }, value => setProgress(value, '计算焦点评分'));
    await displayResult(result); setProgress(1, '完成'); setTimeout(() => { $('#progress-panel').hidden = true; }, 500);
  } catch (error) { $('#progress-panel').hidden = true; showError(error); }
  finally { workingFrames.forEach(frame => frame.bitmap?.close?.()); }
}

async function useSample() {
  releaseCamera(); clearError(); $('#sample-status').textContent = '正在读取样例…';
  try {
    const manifest = await loadSampleManifest('./assets/samples/manifest.json');
    for (let index = 0; index < Math.min(5, manifest.frames.length); index++) { const frame = manifest.frames[index]; const response = await fetch(resolveSampleUrl(frame.path)); const blob = await response.blob(); await addFileToSlot(state, index, new File([blob], `${frame.id}.svg`, { type: blob.type || 'image/svg+xml' })); }
    renderSlots(); updateReady(); $('#sample-status').textContent = '样例已载入，可以直接生成相对深度。';
  } catch (error) { showError(error); $('#sample-status').textContent = ''; }
}

function reset() { client.cancel(); releaseCamera(); resetFrames(state); hideResult(); renderSlots(); updateReady(); $('#sample-status').textContent = ''; clearError(); }
function activateMode(mode) { if (mode !== 'relative') releaseCamera(); state.mode = mode; document.querySelectorAll('.mode-tab').forEach(tab => { const active = tab.dataset.mode === mode; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); }); $('#relative-panel').hidden = mode !== 'relative'; $('#intrinsics-panel').hidden = mode !== 'intrinsics'; $('#scale-panel').hidden = mode !== 'scale'; if (mode !== 'relative') hideResult(); }

async function importJson(file, validator) { const value = JSON.parse(await file.text()); return validator(value); }
function updateCalibrationStatus() { $('#calibration-import-status').textContent = `${state.calibration ? '已导入镜头内参' : '未导入内参'}；${state.scaleCalibration ? '已导入尺度标定' : '未导入尺度标定'}`; }

async function calibrateIntrinsics() {
  const files = [...($('#calibration-input').files || [])]; if (files.length < 3) { $('#calibration-status').textContent = messageFor('CALIBRATION_FAILED'); return; }
  const frames = [];
  try {
    for (const file of files) { const decoded = await decodeFile(file); frames.push({ bitmap: decoded.bitmap, width: decoded.width, height: decoded.height }); }
    state.calibration = await client.run('calibrateIntrinsics', { frames, pattern: { cols: Number($('#pattern-cols').value), rows: Number($('#pattern-rows').value), squareSize: Number($('#square-size').value) } });
    $('#calibration-status').textContent = `已接受 ${state.calibration.viewsAccepted} 个视角，重投影误差 ${state.calibration.rmsErrorPx.toFixed(3)} px。`; $('#download-calibration').disabled = false; updateCalibrationStatus();
  } catch (error) { $('#calibration-status').textContent = `${error.code || 'CALIBRATION_FAILED'}：${messageFor(error.code || 'CALIBRATION_FAILED')}`; } finally { frames.forEach(frame => frame.bitmap?.close?.()); }
}

async function calibrateScale() {
  const files = [...($('#scale-input').files || [])]; if (files.length !== 15) { $('#scale-status').textContent = '尺度标定需要恰好 15 张照片：三个距离，每个距离五张。'; return; }
  const distances = [1, 2, 3].map(index => Number($(`#distance-${index}`).value)); const decoded = [];
  try {
    for (const file of files) decoded.push(await decodeFile(file));
    const groups = [0, 1, 2].map(index => ({ distanceM: distances[index], frames: decoded.slice(index * 5, index * 5 + 5).map(frame => ({ bitmap: frame.bitmap, width: frame.width, height: frame.height })) }));
    state.scaleCalibration = await client.run('calibrateScale', { groups, distances }); $('#scale-status').textContent = `尺度拟合完成，焦点峰值 ${state.scaleCalibration.focusMetrics.map(value => value.toFixed(2)).join(' / ')}，结果为参考级。`; $('#download-scale').disabled = false; updateCalibrationStatus();
  } catch (error) { $('#scale-status').textContent = `${error.code || 'CALIBRATION_FAILED'}：${messageFor(error.code || 'CALIBRATION_FAILED')}`; } finally { decoded.forEach(frame => frame.bitmap?.close?.()); }
}

function bind() {
  renderSlots(); updateReady();
  $('#focus-support').textContent = typeof ImageCapture === 'function' ? '本机浏览器可能支持网页调焦；实际能力取决于摄像头。若无调焦滑杆，请使用系统相机逐张拍摄后导入。' : '本机浏览器不支持网页调焦，请使用系统相机逐张拍摄后导入。';
  $('#start-camera').addEventListener('click', startCamera); $('#capture-frame').addEventListener('click', captureNextFrame); $('#close-camera').addEventListener('click', () => { releaseCamera(); setCameraStatus('相机已关闭，可从相册选择照片。'); $('#camera-session').hidden = false; }); $('#focus-distance').addEventListener('input', applyFocusFromInput);
  $('#sample-button').addEventListener('click', useSample); $('#gallery-input').addEventListener('change', async event => { releaseCamera(); const files = [...(event.target.files || [])].slice(0, 5); resetFrames(state); for (let index = 0; index < files.length; index++) await addFileToSlot(state, index, files[index]); renderSlots(); updateReady(); });
  $('#reset-button').addEventListener('click', reset); $('#again-button').addEventListener('click', reset); $('#run-button').addEventListener('click', runEstimate); $('#cancel-button').addEventListener('click', () => { client.cancel(); releaseCamera(); $('#progress-panel').hidden = true; showError(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' })); });
  document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => activateMode(tab.dataset.mode)));
  document.querySelectorAll('.view-tabs button').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.view-tabs button').forEach(item => item.classList.toggle('active', item === tab)); ['depth', 'confidence', 'best', 'middle'].forEach(kind => { $(`#${kind === 'depth' ? 'result' : kind}-preview`).hidden = tab.dataset.view !== kind; }); }));
  $('#intrinsics-import').addEventListener('change', async event => { try { state.calibration = await importJson(event.target.files[0], validateCalibration); updateCalibrationStatus(); } catch (error) { showError(error); } });
  $('#scale-import').addEventListener('change', async event => { try { state.scaleCalibration = await importJson(event.target.files[0], validateScale); updateCalibrationStatus(); } catch (error) { showError(error); } });
  $('#calibration-input').addEventListener('change', event => { $('#calibration-status').textContent = `已选择 ${event.target.files?.length || 0} 个标定视角。`; }); $('#calibrate-button').addEventListener('click', calibrateIntrinsics); $('#download-calibration').addEventListener('click', () => state.calibration && downloadBlob(new Blob([JSON.stringify(state.calibration, null, 2)], { type: 'application/json' }), 'lab005-camera-intrinsics.json'));
  $('#scale-input').addEventListener('change', event => { $('#scale-status').textContent = `已选择 ${event.target.files?.length || 0} 张照片。`; }); $('#scale-button').addEventListener('click', calibrateScale); $('#download-scale').addEventListener('click', () => state.scaleCalibration && downloadBlob(new Blob([JSON.stringify(state.scaleCalibration, null, 2)], { type: 'application/json' }), 'lab005-focus-depth-scale.json'));
  $('#download-button').addEventListener('click', () => state.result && fetch($('#result-preview').src).then(response => response.blob()).then(blob => downloadBlob(blob, 'lab-005-relative-depth.png')));
  $('#download-json').addEventListener('click', () => state.result && downloadBlob(new Blob([JSON.stringify({ schema: 'lab005.depth-result.v1', width: state.result.width, height: state.result.height, depth: [...state.result.depth], metricDepthM: state.result.metricDepthM ? [...state.result.metricDepthM] : null, metricQuality: state.result.metricQuality, confidence: [...state.result.confidence], invalid: [...state.result.invalid] }, null, 2)], { type: 'application/json' }), 'lab-005-depth.json'));
  $('#share-button').addEventListener('click', async () => { try { if (!navigator.share) throw new Error('share unavailable'); await navigator.share({ title: 'LAB 005 离焦测深', text: '五张焦点照片的相对深度结果' }); $('#share-status').textContent = '已打开系统分享。'; } catch { $('#share-status').textContent = '当前浏览器不支持系统分享，请使用下载按钮。'; } });
}

bind();
window.addEventListener('pagehide', releaseCamera, { once: true });
$('#result-preview').addEventListener('click', event => {
  if (!state.result) return; const rect = event.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(state.result.width - 1, Math.round((event.clientX - rect.left) / rect.width * state.result.width))); const y = Math.max(0, Math.min(state.result.height - 1, Math.round((event.clientY - rect.top) / rect.height * state.result.height))); const tile = Math.min(state.result.rows - 1, Math.floor(y / state.result.tileSize)) * state.result.cols + Math.min(state.result.cols - 1, Math.floor(x / state.result.tileSize)); $('#sample-query').hidden = false;
  if (state.result.invalid[tile]) $('#query-value').textContent = '该区域纹理不足'; else { const metric = state.result.metricDepthM ? `，参考距离 ${state.result.metricDepthM[tile].toFixed(2)} m` : ''; $('#query-value').textContent = `相对深度 ${(state.result.depth[tile] * 100).toFixed(0)}%，置信度 ${(state.result.confidence[tile] * 100).toFixed(0)}%${metric}`; }
});
