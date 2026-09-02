import { analyzeExposures } from "./analysis.js";
import { filesFromSample, validateFiles } from "./capture.js";
import { messageForError } from "./errors.js";
import { createState, replaceFiles, setFileAt, setProgress } from "./state.js";
import { FusionWorkerClient } from "./worker-client.js";

const elements = {
  sample: document.querySelector("#sample-button"),
  sampleStatus: document.querySelector("#sample-status"),
  camera: [...document.querySelectorAll(".camera-input")],
  slots: [...document.querySelectorAll(".capture-slot")],
  gallery: document.querySelector("#gallery-input"),
  reset: document.querySelector("#reset-button"),
  analysis: document.querySelector("#analysis-status"),
  error: document.querySelector("#error-message"),
  run: document.querySelector("#run-button"),
  progressPanel: document.querySelector("#progress-panel"),
  progress: document.querySelector("#progress"),
  progressStage: document.querySelector("#progress-stage"),
  progressPercent: document.querySelector("#progress-percent"),
  cancel: document.querySelector("#cancel-button"),
  resultPanel: document.querySelector("#result-panel"),
  result: document.querySelector("#result-preview"),
  middle: document.querySelector("#middle-preview"),
  compareLayer: document.querySelector("#compare-layer"),
  compareControl: document.querySelector(".compare-control"),
  compare: document.querySelector("#compare-range"),
  tabs: [...document.querySelectorAll("[data-view]")],
  summary: document.querySelector("#result-summary"),
  download: document.querySelector("#download-button"),
  share: document.querySelector("#share-button"),
  shareStatus: document.querySelector("#share-status"),
  again: document.querySelector("#again-button"),
};

let state = createState();
let client;
let previewUrls = [];
let resultUrls = [];

function workerClient() { client ??= new FusionWorkerClient(); return client; }
function releaseUrls(urls) { urls.splice(0).forEach((url) => URL.revokeObjectURL(url)); }

function showError(error) {
  elements.error.textContent = messageForError(error);
  elements.error.hidden = false;
  elements.analysis.textContent = "检查未通过";
}

async function analysisImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, width, height);
    return { width, height, data: context.getImageData(0, 0, width, height).data };
  } finally { bitmap.close(); }
}

async function analyzeSelection() {
  if (!state.files.every(Boolean)) {
    elements.analysis.textContent = `已准备 ${state.files.filter(Boolean).length} / 3 张`;
    elements.run.disabled = true;
    return;
  }
  try {
    const images = await Promise.all(state.files.map(analysisImage));
    const metrics = analyzeExposures(images);
    state = { ...state, exposure: metrics };
    elements.analysis.textContent = `曝光跨度 ${metrics.relativeSpread.toFixed(2)} 档 · 场景将在融合前检查`;
    elements.run.disabled = false;
    elements.error.hidden = true;
  } catch (error) { showError(error); elements.run.disabled = true; }
}

function renderSlots() {
  releaseUrls(previewUrls);
  state.files.forEach((file, index) => {
    const image = elements.slots[index].querySelector("img");
    const action = elements.slots[index].querySelector(".slot-action");
    if (!file) {
      image.hidden = true;
      image.removeAttribute("src");
      action.textContent = "拍摄";
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    image.src = url;
    image.alt = `${file.name} 预览`;
    image.hidden = false;
    action.textContent = "重拍";
  });
}

async function useFiles(files) {
  try {
    validateFiles(files);
    state = replaceFiles(state, files);
    renderSlots();
    await analyzeSelection();
    document.querySelector("#capture-title").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { showError(error); }
}

function updateProgress({ stage, progress }) {
  state = setProgress(state, stage, progress);
  elements.progress.value = progress;
  elements.progressStage.textContent = stage;
  elements.progressPercent.textContent = `${Math.round(progress * 100)}%`;
}

function setView(view) {
  elements.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  const urls = state.resultUrls;
  if (view === "fusion") {
    elements.result.src = urls.fusion;
    elements.middle.src = urls.middle;
    elements.compareLayer.hidden = false;
    elements.compareControl.hidden = false;
  } else {
    elements.result.src = view === "middle" ? urls.middle : urls.motion;
    elements.compareLayer.hidden = true;
    elements.compareControl.hidden = true;
  }
}

function showResult(result) {
  releaseUrls(resultUrls);
  const urls = {
    fusion: URL.createObjectURL(result.jpeg),
    middle: URL.createObjectURL(result.middle),
    motion: URL.createObjectURL(result.motion),
  };
  resultUrls.push(...Object.values(urls));
  state = { ...state, phase: "complete", result, resultUrls: urls };
  elements.summary.textContent = `${result.width} × ${result.height} · 运动保护 ${(result.report.motion.protectedFraction * 100).toFixed(1)}%`;
  elements.resultPanel.hidden = false;
  setView("fusion");
  elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function startFusion() {
  elements.error.hidden = true;
  elements.resultPanel.hidden = true;
  elements.progressPanel.hidden = false;
  elements.run.disabled = true;
  updateProgress({ stage: "准备照片", progress: 0 });
  try {
    const result = await workerClient().fuse(state.files, { onProgress: updateProgress });
    showResult(result);
  } catch (error) {
    if (error.code !== "CANCELLED") showError(error);
    else elements.analysis.textContent = "已取消，可重新开始";
  } finally {
    elements.progressPanel.hidden = true;
    elements.run.disabled = !state.files.every(Boolean);
  }
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lab-003-fusion-${new Date().toISOString().slice(0, 10)}.jpg`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset() {
  client?.close();
  releaseUrls(previewUrls);
  releaseUrls(resultUrls);
  state = createState();
  renderSlots();
  elements.analysis.textContent = "等待三张照片";
  elements.error.hidden = true;
  elements.resultPanel.hidden = true;
  elements.run.disabled = true;
  elements.camera.forEach((input) => { input.value = ""; });
  elements.gallery.value = "";
}

elements.sample.addEventListener("click", async () => {
  elements.sampleStatus.textContent = "正在读取内置样例…";
  try {
    await useFiles(await filesFromSample());
    elements.sampleStatus.textContent = "样例已载入";
  } catch (error) { elements.sampleStatus.textContent = messageForError(error); }
});
elements.camera.forEach((input) => input.addEventListener("change", async () => {
  if (!input.files[0]) return;
  state = setFileAt(state, Number(input.dataset.index), input.files[0]);
  renderSlots();
  await analyzeSelection();
}));
elements.gallery.addEventListener("change", () => useFiles([...elements.gallery.files]));
elements.reset.addEventListener("click", reset);
elements.again.addEventListener("click", () => { reset(); document.querySelector("#capture-title").scrollIntoView({ behavior: "smooth" }); });
elements.run.addEventListener("click", startFusion);
elements.cancel.addEventListener("click", () => workerClient().cancel());
elements.compare.addEventListener("input", () => { elements.compareLayer.style.width = `${elements.compare.value}%`; });
elements.tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
elements.download.addEventListener("click", () => downloadBlob(state.result.jpeg));
elements.share.addEventListener("click", async () => {
  const file = new File([state.result.jpeg], "lab-003-fusion.jpg", { type: "image/jpeg" });
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    elements.shareStatus.textContent = "当前浏览器不支持文件分享，已改为下载。";
    downloadBlob(state.result.jpeg);
    return;
  }
  try { await navigator.share({ title: "LAB 003 曝光融合", files: [file] }); }
  catch (error) { elements.shareStatus.textContent = error.name === "AbortError" ? "已取消分享。" : "分享未完成，结果仍保留在页面中。"; }
});

window.addEventListener("pagehide", () => { client?.close(); releaseUrls(previewUrls); releaseUrls(resultUrls); });
renderSlots();
