import { pairErrorMessage, StitchError } from "./errors.js";
import {
  appendImages,
  createQueueState,
  moveImage,
  removeImage,
  reorderImages,
  warningMessages,
} from "./state.js";
import { StitchWorkerClient } from "./worker-client.js";

const SAMPLE_MANIFEST_URL = "./assets/samples/manifest.json";
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const elements = {
  gallery: document.querySelector("#gallery-input"),
  camera: document.querySelector("#camera-input"),
  sample: document.querySelector("#sample-button"),
  sampleStatus: document.querySelector("#sample-status"),
  queue: document.querySelector("#image-queue"),
  empty: document.querySelector("#empty-queue"),
  warnings: document.querySelector("#queue-warnings"),
  quality: document.querySelector("#quality"),
  run: document.querySelector("#run-button"),
  cancel: document.querySelector("#cancel-button"),
  progressPanel: document.querySelector("#progress-panel"),
  progress: document.querySelector("#progress"),
  progressStage: document.querySelector("#progress-stage"),
  progressPercent: document.querySelector("#progress-percent"),
  status: document.querySelector("#app-status"),
  error: document.querySelector("#error-message"),
  resultPanel: document.querySelector("#result-panel"),
  resultPreview: document.querySelector("#result-preview"),
  seamPreview: document.querySelector("#seam-preview"),
  seamToggle: document.querySelector("#seam-toggle"),
  cropSummary: document.querySelector("#crop-summary"),
  cropLeft: document.querySelector("#crop-left"),
  cropRight: document.querySelector("#crop-right"),
  cropTop: document.querySelector("#crop-top"),
  cropBottom: document.querySelector("#crop-bottom"),
  download: document.querySelector("#download-button"),
  share: document.querySelector("#share-button"),
  shareStatus: document.querySelector("#share-status"),
};

let state = createQueueState();
let dragSourceId = null;
let pointerDrag = null;
let client;
let resultUrls = [];

function workerClient() {
  client ??= new StitchWorkerClient();
  return client;
}

function makeId() {
  return crypto.randomUUID?.() ??
    `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function releaseResultUrls() {
  resultUrls.forEach((url) => URL.revokeObjectURL(url));
  resultUrls = [];
}

function revokeImage(image) {
  if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
}

async function imageRecord(file) {
  if (!acceptedTypes.has(file.type)) {
    throw new StitchError("UNSUPPORTED_FORMAT", `Unsupported type: ${file.type}`);
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      id: makeId(),
      name: file.name,
      width: bitmap.width,
      height: bitmap.height,
      file,
      previewUrl: URL.createObjectURL(file),
    };
  } catch (error) {
    throw new StitchError("DECODE_FAILED", `Could not read ${file.name}.`, {
      cause: error,
    });
  } finally {
    bitmap?.close();
  }
}

function queueButton(label, text, action, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.ariaLabel = label;
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}

function move(id, direction) {
  state = moveImage(state, id, direction);
  renderQueue();
}

function remove(id) {
  const image = state.images.find((item) => item.id === id);
  revokeImage(image);
  state = removeImage(state, id);
  renderQueue();
}

function reorder(sourceId, targetId) {
  state = reorderImages(state, sourceId, targetId);
  renderQueue();
}

function renderQueue() {
  elements.queue.replaceChildren();
  state.images.forEach((image, index) => {
    const item = document.createElement("li");
    item.className = "queue-item";
    item.draggable = true;
    item.dataset.imageId = image.id;
    item.addEventListener("dragstart", () => {
      dragSourceId = image.id;
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      dragSourceId = null;
      item.classList.remove("dragging");
    });
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      if (dragSourceId) reorder(dragSourceId, image.id);
    });
    item.addEventListener("pointerdown", (event) => {
      if (
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0) ||
        event.target.closest?.("button, input, select, a")
      ) {
        return;
      }
      pointerDrag = {
        pointerId: event.pointerId,
        sourceId: image.id,
        targetId: image.id,
      };
      item.classList.add("dragging");
      item.setPointerCapture?.(event.pointerId);
    });
    item.addEventListener("pointermove", (event) => {
      if (pointerDrag?.pointerId !== event.pointerId) return;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-image-id]");
      if (target?.dataset.imageId) {
        pointerDrag.targetId = target.dataset.imageId;
      }
      event.preventDefault();
    });
    item.addEventListener("pointerup", (event) => {
      if (pointerDrag?.pointerId !== event.pointerId) return;
      const { sourceId, targetId } = pointerDrag;
      pointerDrag = null;
      item.classList.remove("dragging");
      if (item.hasPointerCapture?.(event.pointerId)) {
        item.releasePointerCapture(event.pointerId);
      }
      if (sourceId !== targetId) reorder(sourceId, targetId);
    });
    item.addEventListener("pointercancel", (event) => {
      if (pointerDrag?.pointerId !== event.pointerId) return;
      pointerDrag = null;
      item.classList.remove("dragging");
    });

    const preview = document.createElement("img");
    preview.className = "thumbnail";
    preview.src = image.previewUrl;
    preview.alt = `${image.name} 缩略图`;
    const meta = document.createElement("div");
    meta.className = "queue-meta";
    const name = document.createElement("span");
    name.className = "queue-name";
    name.dataset.imageName = "";
    name.textContent = image.name;
    const dimensions = document.createElement("span");
    dimensions.className = "queue-dimensions";
    dimensions.textContent = `${image.width} × ${image.height}`;
    const actions = document.createElement("div");
    actions.className = "queue-actions";
    actions.append(
      queueButton(`${image.name} 前移`, "←", () => move(image.id, -1), index === 0),
      queueButton(
        `${image.name} 后移`,
        "→",
        () => move(image.id, 1),
        index === state.images.length - 1,
      ),
      queueButton(`${image.name} 删除`, "×", () => remove(image.id)),
    );
    meta.append(name, dimensions, actions);
    item.append(preview, meta);
    elements.queue.append(item);
  });
  elements.empty.hidden = state.images.length > 0;
  elements.run.disabled = state.images.length < 2 || state.status === "running";
  elements.warnings.replaceChildren(
    ...warningMessages(state.images).map((message) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = message;
      return paragraph;
    }),
  );
}

async function appendFiles(files) {
  elements.error.hidden = true;
  try {
    const records = [];
    for (const file of files) records.push(await imageRecord(file));
    state = appendImages(state, records);
    renderQueue();
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  elements.error.textContent = pairErrorMessage(error);
  elements.error.hidden = false;
  elements.status.textContent = "";
}

function setRunning(running) {
  state = { ...state, status: running ? "running" : "idle" };
  elements.run.disabled = running || state.images.length < 2;
  elements.cancel.hidden = !running;
  elements.progressPanel.hidden = !running;
}

function setProgress({ stage, progress }) {
  const value = Math.max(0, Math.min(1, progress));
  elements.progress.value = value;
  elements.progressStage.textContent = stage;
  elements.progressPercent.textContent = `${Math.round(value * 100)}%`;
}

function configureCrop(result) {
  const horizontalMaximum = Math.max(0, Math.floor(result.width / 3));
  const verticalMaximum = Math.max(0, Math.floor(result.height / 3));
  for (const input of [elements.cropLeft, elements.cropRight]) {
    input.max = String(horizontalMaximum);
    input.value = "0";
  }
  for (const input of [elements.cropTop, elements.cropBottom]) {
    input.max = String(verticalMaximum);
    input.value = "0";
  }
  updateCropPreview();
}

function cropInsets() {
  return {
    left: Number(elements.cropLeft.value),
    right: Number(elements.cropRight.value),
    top: Number(elements.cropTop.value),
    bottom: Number(elements.cropBottom.value),
  };
}

function updateCropPreview() {
  const crop = cropInsets();
  const inset = `${crop.top}px ${crop.right}px ${crop.bottom}px ${crop.left}px`;
  elements.resultPreview.style.clipPath = `inset(${inset})`;
  elements.seamPreview.style.clipPath = `inset(${inset})`;
  elements.cropSummary.textContent =
    `左 ${crop.left} · 右 ${crop.right} · 上 ${crop.top} · 下 ${crop.bottom}`;
}

function showResult(result) {
  releaseResultUrls();
  const resultUrl = URL.createObjectURL(result.jpeg);
  resultUrls.push(resultUrl);
  elements.resultPreview.src = resultUrl;
  if (result.seam) {
    const seamUrl = URL.createObjectURL(result.seam);
    resultUrls.push(seamUrl);
    elements.seamPreview.src = seamUrl;
  } else {
    elements.seamPreview.removeAttribute("src");
  }
  state = { ...state, result };
  configureCrop(result);
  elements.resultPanel.hidden = false;
  elements.status.textContent = "拼接完成";
}

async function startStitch() {
  if (state.images.length < 2) return;
  elements.error.hidden = true;
  elements.resultPanel.hidden = true;
  elements.status.textContent = "";
  elements.shareStatus.textContent = "";
  setProgress({ stage: "准备中", progress: 0 });
  setRunning(true);
  try {
    const result = await workerClient().stitch(state.images, {
      quality: elements.quality.value,
      onProgress: setProgress,
    });
    showResult(result);
  } catch (error) {
    if (error.code === "CANCELLED") {
      elements.status.textContent = "已取消拼接。";
    } else {
      showError(error);
    }
  } finally {
    setRunning(false);
  }
}

async function croppedBlob() {
  const crop = cropInsets();
  if (Object.values(crop).every((value) => value === 0)) return state.result.jpeg;
  let bitmap;
  try {
    bitmap = await createImageBitmap(state.result.jpeg);
    const width = bitmap.width - crop.left - crop.right;
    const height = bitmap.height - crop.top - crop.bottom;
    if (width < 1 || height < 1) return state.result.jpeg;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(
      bitmap,
      crop.left,
      crop.top,
      width,
      height,
      0,
      0,
      width,
      height,
    );
    return await new Promise((resolve) =>
      canvas.toBlob(
        (blob) => resolve(blob ?? state.result.jpeg),
        "image/jpeg",
        0.92,
      ));
  } catch {
    return state.result.jpeg;
  } finally {
    bitmap?.close();
  }
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `panorama-${new Date().toISOString().slice(0, 10)}.jpg`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function download() {
  downloadBlob(await croppedBlob());
}

async function share() {
  const blob = await croppedBlob();
  const file = new File([blob], "panorama.jpg", { type: "image/jpeg" });
  try {
    if (typeof navigator.share !== "function") throw new Error("Share unavailable");
    await navigator.share({
      title: "LAB 002 全景拼接",
      text: "我的本地全景拼接结果",
      files: [file],
    });
    elements.shareStatus.textContent = "已打开系统分享。";
  } catch {
    downloadBlob(blob);
    elements.shareStatus.textContent = "分享不可用，已改为下载 JPEG。";
  }
}

async function loadSample() {
  elements.sampleStatus.textContent = "正在读取示例…";
  try {
    const manifestResponse = await fetch(SAMPLE_MANIFEST_URL);
    if (!manifestResponse.ok) throw new Error("missing manifest");
    const manifest = await manifestResponse.json();
    const selected =
      manifest.sequences?.[manifest.defaultSequence ?? "mountains"];
    if (!selected?.files?.length) throw new Error("missing default sequence");
    const sampleUrls = selected.files.map(
      (relative) => new URL(relative, manifestResponse.url).href,
    );
    const responses = await Promise.all(sampleUrls.map((url) => fetch(url)));
    if (responses.some((response) => !response.ok)) throw new Error("missing");
    const files = await Promise.all(responses.map(async (response, index) =>
      new File(
        [await response.blob()],
        `${manifest.defaultSequence ?? "mountains"}-${index + 1}.jpg`,
        { type: "image/jpeg" },
      )));
    await appendFiles(files);
    elements.sampleStatus.textContent =
      `已载入 ${files.length} 张真实${selected.title ?? "现场"}照片，` +
      `素材：${selected.creator}（${selected.license}）。`;
  } catch {
    elements.sampleStatus.textContent =
      "无法读取本地示例，请刷新页面后重试。照片不会上传。";
  }
}

for (const input of [elements.gallery, elements.camera]) {
  input.addEventListener("change", async () => {
    await appendFiles([...input.files]);
    input.value = "";
  });
}
elements.sample.addEventListener("click", loadSample);
elements.run.addEventListener("click", startStitch);
elements.cancel.addEventListener("click", () => workerClient().cancel());
elements.seamToggle.addEventListener("change", () => {
  elements.seamPreview.hidden = !elements.seamToggle.checked;
});
for (const input of [
  elements.cropLeft,
  elements.cropRight,
  elements.cropTop,
  elements.cropBottom,
]) {
  input.addEventListener("input", updateCropPreview);
}
elements.download.addEventListener("click", download);
elements.share.addEventListener("click", share);

renderQueue();
