import { APP_CONFIG } from '../config.js';
import { drawDepth, drawSource, loadImage } from './canvas-renderer.js';
import { createDepthEngine } from './depth-engine.js';
import { formatMetricDepth, formatRelativeDepth, mapPointerToImage, sampleDepth } from './depth-utils.js';
import { prepareImageBlob, validateImageFile } from './image-utils.js';
import { metricDepthAvailable, requestMetricDepth } from './metric-api.js';
import { renderShareCard, shareOrDownload } from './share-card.js';
import { appendPoint, clampCompare, createInitialState } from './ui-state.js';

const params = new URLSearchParams(location.search);
const testMode = params.get('e2e') === '1';
const screens = new Map([...document.querySelectorAll('[data-screen]')].map(node => [node.dataset.screen, node]));
const elements = {
  cameraInput: document.querySelector('#camera-input'), albumInput: document.querySelector('#album-input'),
  processingPreview: document.querySelector('#processing-preview'), processingActive: document.querySelector('#processing-active'),
  processingError: document.querySelector('#processing-error'), processingStatus: document.querySelector('#processing-status'),
  progress: document.querySelector('.progress-track'), progressFill: document.querySelector('#progress-fill'),
  errorTitle: document.querySelector('#error-title'), errorMessage: document.querySelector('#error-message'),
  resultVisual: document.querySelector('#result-visual'), sourceCanvas: document.querySelector('#source-canvas'),
  depthCanvas: document.querySelector('#depth-canvas'), markerLayer: document.querySelector('#marker-layer'),
  compareSlider: document.querySelector('#compare-slider'), currentReading: document.querySelector('#current-reading'),
  metricButton: document.querySelector('#metric-button'), shareButton: document.querySelector('#share-button'),
  actionStatus: document.querySelector('#action-status'), backendLabel: document.querySelector('#backend-label'),
  infoDialog: document.querySelector('#info-dialog'), metricDialog: document.querySelector('#metric-dialog'),
};

const state = createInitialState();
let rawBlob = null;
let processedBlob = null;
let sourceUrl = null;
let sourceImage = null;
let abortController = null;
let taskSequence = 0;

function abortError() {
  return new DOMException('处理已取消', 'AbortError');
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
}

function createTestEngine() {
  let attempt = 0;
  return {
    async infer(blob, { signal, onProgress }) {
      attempt += 1;
      const delay = Math.max(90, Number(params.get('e2eDelay')) || 150);
      onProgress({ status: 'download', progress: 18, backend: 'wasm' });
      await wait(delay / 3, signal);
      onProgress({ status: 'ready', progress: 58, backend: 'wasm' });
      await wait(delay / 3, signal);
      if (params.get('e2eFailOnce') === '1' && attempt === 1) throw new Error('深度模型运行失败');
      onProgress({ status: 'inferencing', progress: 94, backend: 'wasm' });
      await wait(delay / 3, signal);
      const width = 80;
      const height = 60;
      const depth = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) depth[y * width + x] = (x / width * .62) + (y / height * .38);
      return { width, height, depth, model: 'Depth Anything V2 Small', revision: 'e2e', backend: 'wasm', mode: 'relative' };
    },
    cancel() {},
    dispose() {},
  };
}

const engine = testMode ? createTestEngine() : createDepthEngine({ workerUrl: new URL('./depth.worker.js', import.meta.url) });

function showScreen(name) {
  state.screen = name;
  for (const [screenName, node] of screens) node.hidden = screenName !== name;
  scrollTo({ top: 0, behavior: 'auto' });
}

function replaceSourceUrl(blob) {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(blob);
  elements.processingPreview.src = sourceUrl;
  return sourceUrl;
}

function setProgress(value, stage, text) {
  const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  elements.progressFill.style.width = `${progress}%`;
  elements.progress.setAttribute('aria-valuenow', String(progress));
  elements.processingStatus.textContent = text;
  document.querySelectorAll('[data-stage]').forEach(item => {
    const index = Number(item.dataset.stage);
    item.classList.toggle('is-active', index === stage);
    item.classList.toggle('is-done', index < stage);
  });
}

function showError(error) {
  elements.processingActive.hidden = true;
  elements.processingError.hidden = false;
  const cancelled = error?.name === 'AbortError';
  elements.errorTitle.textContent = cancelled ? '处理已取消' : '深度模型运行失败';
  elements.errorMessage.textContent = cancelled ? '当前照片仍可重新处理。' : (error?.message || '请检查网络后重试。');
  globalThis.lucide?.createIcons();
}

function onInferenceProgress(progress) {
  const raw = Number(progress?.progress);
  const value = Number.isFinite(raw) ? (raw <= 1 ? raw * 100 : raw) : 36;
  if (progress?.status === 'inferencing') setProgress(Math.max(72, value), 2, '推理深度');
  else setProgress(Math.max(28, Math.min(70, value)), 1, '加载模型');
}

async function runCurrentImage() {
  if (!rawBlob) return;
  const taskId = ++taskSequence;
  abortController?.abort();
  abortController = new AbortController();
  elements.processingActive.hidden = false;
  elements.processingError.hidden = true;
  showScreen('processing');
  setProgress(5, 0, '准备图片');
  try {
    const prepared = await prepareImageBlob(rawBlob);
    if (taskId !== taskSequence) return;
    processedBlob = prepared.blob;
    sourceImage = await loadImage(replaceSourceUrl(processedBlob));
    setProgress(25, 1, '加载模型');
    const result = await engine.infer(processedBlob, { signal: abortController.signal, onProgress: onInferenceProgress });
    if (taskId !== taskSequence) return;
    state.depth = result;
    state.mode = 'relative';
    state.points = [];
    drawSource(sourceImage, elements.sourceCanvas);
    drawDepth(result.depth, result.width, result.height, elements.depthCanvas);
    elements.resultVisual.style.setProperty('--ratio', `${prepared.width} / ${prepared.height}`);
    elements.backendLabel.textContent = `${result.backend === 'webgpu' ? 'WebGPU' : 'WASM'} · 本地相对深度`;
    renderMarkers();
    setView('compare');
    setProgress(100, 2, '处理完成');
    showScreen('result');
  } catch (error) {
    if (taskId !== taskSequence) return;
    showError(error);
  }
}

async function selectBlob(blob) {
  try {
    validateImageFile(blob);
    rawBlob = blob;
    replaceSourceUrl(blob);
    await runCurrentImage();
  } catch (error) {
    showScreen('processing');
    showError(error);
  }
}

function setView(view) {
  state.view = view;
  elements.resultVisual.dataset.view = view;
  document.querySelectorAll('[data-view-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewButton === view)));
  document.querySelector('.compare-control').hidden = view !== 'compare';
}

function formatPoint(value) {
  return state.mode === 'metric' ? formatMetricDepth(value) : formatRelativeDepth(value);
}

function renderMarkers() {
  elements.markerLayer.replaceChildren(...state.points.map((point, index) => {
    const marker = document.createElement('span');
    marker.className = 'depth-marker';
    marker.style.left = `${point.x * 100}%`;
    marker.style.top = `${point.y * 100}%`;
    marker.textContent = `P${index + 1}`;
    marker.title = formatPoint(point.value);
    return marker;
  }));
  elements.currentReading.textContent = state.points.length ? formatPoint(state.points.at(-1).value) : '未选择位置';
}

async function useMetricDepth() {
  elements.metricDialog.showModal();
}

async function requestConfirmedMetric() {
  if (!processedBlob || !metricDepthAvailable(APP_CONFIG.metricApiBase)) return;
  elements.actionStatus.textContent = '正在请求米制服务…';
  try {
    const result = await requestMetricDepth(APP_CONFIG.metricApiBase, processedBlob);
    state.depth = { ...result, mode: 'metric', backend: 'remote' };
    state.mode = 'metric';
    state.points = [];
    drawDepth(result.depth, result.width, result.height, elements.depthCanvas);
    elements.backendLabel.textContent = `${result.model} · 远端米制深度`;
    renderMarkers();
    elements.actionStatus.textContent = '米制深度已更新';
  } catch (error) {
    elements.actionStatus.textContent = error.message;
  }
}

document.querySelectorAll('input[type=file]').forEach(input => input.addEventListener('change', () => {
  const [file] = input.files || [];
  if (file) selectBlob(file);
  input.value = '';
}));
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', async () => {
  const response = await fetch(button.dataset.sample);
  if (!response.ok) return showError(new Error('示例图片加载失败'));
  await selectBlob(await response.blob());
}));
document.querySelector('#cancel-button').addEventListener('click', () => abortController?.abort());
document.querySelector('#retry-button').addEventListener('click', runCurrentImage);
document.querySelector('#choose-again-button').addEventListener('click', () => showScreen('home'));
document.querySelector('#new-image-button').addEventListener('click', () => showScreen('home'));
document.querySelectorAll('[data-view-button]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewButton)));
elements.compareSlider.addEventListener('input', () => {
  state.compare = clampCompare(Number(elements.compareSlider.value) / 100);
  elements.resultVisual.style.setProperty('--compare', `${Math.round(state.compare * 100)}%`);
});
elements.resultVisual.addEventListener('click', event => {
  if (!state.depth) return;
  const point = mapPointerToImage(event.clientX, event.clientY, elements.resultVisual.getBoundingClientRect(), elements.sourceCanvas.width, elements.sourceCanvas.height);
  if (!point) return;
  const value = sampleDepth(state.depth.depth, state.depth.width, state.depth.height, point.x, point.y);
  state.points = appendPoint(state.points, { ...point, value });
  renderMarkers();
});
document.querySelector('#info-button').addEventListener('click', () => elements.infoDialog.showModal());
elements.metricButton.addEventListener('click', useMetricDepth);
document.querySelector('#metric-confirm').addEventListener('click', requestConfirmedMetric);
elements.shareButton.addEventListener('click', async () => {
  elements.shareButton.disabled = true;
  elements.actionStatus.textContent = '正在生成分享图…';
  try {
    const blob = await renderShareCard({
      sourceCanvas: elements.sourceCanvas, depthCanvas: elements.depthCanvas,
      points: state.points, mode: state.mode, canonicalUrl: APP_CONFIG.canonicalUrl,
    });
    const result = await shareOrDownload(blob, testMode ? { navigatorObject: {} } : undefined);
    elements.actionStatus.textContent = result === 'shared' ? '已打开系统分享' : '分享图已下载';
  } catch (error) {
    elements.actionStatus.textContent = error.message;
  } finally {
    elements.shareButton.disabled = false;
  }
});

if (metricDepthAvailable(APP_CONFIG.metricApiBase)) {
  elements.metricButton.disabled = false;
  elements.metricButton.textContent = '获取米制深度';
}
globalThis.addEventListener('beforeunload', () => {
  abortController?.abort();
  engine.dispose();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
});
globalThis.lucide?.createIcons();
