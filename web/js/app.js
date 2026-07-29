import { GeometryError, orderQuad, validateQuad } from "./geometry.js";
import {
  acceptRendered, addDefaultCorner, addPoint, applyPreset, beginRender, canExport,
  createEditorState, markPreviewValid, movePoint, nudgeSelectedPoint,
  removeSelectedPoint, resetEditor, selectPoint, setAsset, setBackground, setCompare,
  setGeometryError, updateOption,
} from "./state.js";
import {
  canvasPixels, createTextCanvas, drawAdaptiveTriangleMeshPreview, drawGridOverlay,
  drawVanishingOverlay, imageToCanvas, installUploadedFont, loadImage,
} from "./renderer.js";
import {
  assertPixelLimit, createExactRenderController,
} from "./exact-render.js";

const MAX_PREVIEW_SIZE = 1200;
const DEFAULT_TEXT = "先贴得准，再融得真";
const ERROR_MESSAGES = {
  OUT_OF_BOUNDS: "角点必须位于画布内",
  DUPLICATE_POINTS: "角点距离过近",
  SELF_INTERSECTION: "四边形边线不能交叉",
  NON_CONVEX: "角点必须构成凸四边形",
  NEAR_COLLINEAR: "三个角点几乎共线",
  AREA_TOO_SMALL: "贴图区域太小",
  TOO_SLENDER: "四边形过于狭长",
  SINGULAR_HOMOGRAPHY: "当前透视无法稳定求解",
};

const byId = (id) => document.getElementById(id);
const canvas = byId("editor-canvas");
const context = canvas.getContext("2d");
const emptyMessage = byId("empty-message");
let state = createEditorState();
let presets = {};
let backgroundCanvas = null;
let assetCanvas = null;
let renderedCanvas = null;
let fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif';
let uploadedFontFace = null;
let animationFrame = null;
let dragging = -1;
let originalHeld = false;

function handleExactResult(data) {
  if (data.id !== state.renderVersion) return;
  const result = data.result;
  renderedCanvas = document.createElement("canvas");
  renderedCanvas.width = result.width;
  renderedCanvas.height = result.height;
  renderedCanvas.getContext("2d").putImageData(
    new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0);
  state = acceptRendered(state, data.id, result);
  updateUi();
}

const exactRender = createExactRenderController({
  createWorker: () =>
    new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
  onResult: handleExactResult,
  onError: (message, id) => {
    if (id !== state.renderVersion) return;
    byId("render-status").textContent = `渲染失败：${message}`;
  },
});

function schedulePreview() {
  if (animationFrame) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = null;
    drawPreview();
  });
}

function pointForEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  return [
    (event.clientX - bounds.left) * canvas.width / bounds.width,
    (event.clientY - bounds.top) * canvas.height / bounds.height,
  ];
}

function currentPreviewQuad() {
  if (!state.currentError && state.points.length === 4) return state.points;
  return Array.isArray(state.lastValidPreview) ? state.lastValidPreview : null;
}

function validateCurrent() {
  if (state.points.length < 4) {
    state = setGeometryError(state, null);
    return null;
  }
  try {
    const candidate = state.lastValidPreview ? state.points : orderQuad(state.points);
    const ordered = validateQuad(candidate, canvas.width, canvas.height);
    state = { ...state, points: ordered };
    state = markPreviewValid(state, ordered.map((point) => [...point]));
    return ordered;
  } catch (error) {
    state = setGeometryError(state,
      error instanceof GeometryError ? error.code : "SINGULAR_HOMOGRAPHY");
    return null;
  }
}

function drawHandles() {
  state.points.forEach((point, index) => {
    context.beginPath();
    context.arc(...point, 8, 0, Math.PI * 2);
    context.fillStyle = state.currentError ? "#dc2626" :
      index === state.selectedPoint ? "#0ea5e9" : "#2563eb";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "white";
    context.stroke();
    context.fillStyle = "white";
    context.font = "bold 10px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), point[0], point[1] + .5);
  });
}

function drawPreview() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!backgroundCanvas) return;
  context.drawImage(backgroundCanvas, 0, 0, canvas.width, canvas.height);
  const quad = currentPreviewQuad();
  const compare = originalHeld ? 0 : state.compare;
  if (quad && compare > 0) {
    context.save();
    context.beginPath();
    context.rect(0, 0, canvas.width * compare, canvas.height);
    context.clip();
    if (renderedCanvas && state.rendered) {
      context.drawImage(renderedCanvas, 0, 0, canvas.width, canvas.height);
    } else if (assetCanvas) {
      drawAdaptiveTriangleMeshPreview(context, assetCanvas, quad, state.options);
    }
    context.restore();
    if (compare < 1) {
      context.strokeStyle = "white";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(canvas.width * compare, 0);
      context.lineTo(canvas.width * compare, canvas.height);
      context.stroke();
    }
    if (byId("grid-toggle").checked) drawGridOverlay(context, quad);
    if (byId("vanishing-toggle").checked) drawVanishingOverlay(context, quad);
  }
  drawHandles();
}

function updateUi() {
  const count = state.points.length;
  byId("point-status").textContent = count < 4
    ? `已添加 ${count}/4 个角点`
    : state.currentError ? "当前四边形无效" : "透视区域有效";
  byId("geometry-error").textContent =
    state.currentError ? ERROR_MESSAGES[state.currentError] || state.currentError : "";
  const exportable = canExport(state) && Boolean(state.rendered);
  byId("export-png").disabled = !exportable;
  byId("export-jpeg").disabled = !exportable;
  byId("render-status").textContent = state.currentError
    ? "已保留上次有效预览，修正角点后可导出"
    : state.rendered ? "全分辨率渲染就绪" :
      state.points.length === 4 ? "正在全分辨率渲染…" : "等待有效四边形";
  schedulePreview();
}

function makeTextAsset() {
  assetCanvas = createTextCanvas(byId("text-input").value || DEFAULT_TEXT, {
    fontFamily,
    fontSize: Number(byId("font-size").value),
    color: byId("text-color").value,
  });
  state = setAsset(state, {
    ...canvasPixels(assetCanvas),
    kind: "text",
    width: assetCanvas.width,
    height: assetCanvas.height,
  });
  renderedCanvas = null;
  if (validateCurrent()) renderExact(false);
  else exactRender.cancel();
  updateUi();
}

async function setBackgroundImage(source) {
  const image = await loadImage(source);
  const imageWidth = image.width;
  const imageHeight = image.height;
  try {
    assertPixelLimit(imageWidth, imageHeight);
  } catch (error) {
    image.close?.();
    throw error;
  }
  backgroundCanvas = imageToCanvas(image);
  const scale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(imageWidth, imageHeight));
  canvas.width = Math.max(1, Math.round(imageWidth * scale));
  canvas.height = Math.max(1, Math.round(imageHeight * scale));
  state = setBackground(state, {
    ...canvasPixels(backgroundCanvas),
    width: imageWidth,
    height: imageHeight,
  });
  state = resetEditor(state);
  exactRender.cancel();
  renderedCanvas = null;
  emptyMessage.hidden = true;
  updateUi();
}

async function setPngAsset(file) {
  const image = await loadImage(file);
  const imageWidth = image.width;
  const imageHeight = image.height;
  try {
    assertPixelLimit(imageWidth, imageHeight);
  } catch (error) {
    image.close?.();
    throw error;
  }
  assetCanvas = imageToCanvas(image);
  state = setAsset(state, {
    ...canvasPixels(assetCanvas),
    kind: "png",
    width: imageWidth,
    height: imageHeight,
  });
  renderedCanvas = null;
  if (validateCurrent()) renderExact(true);
  else exactRender.cancel();
  updateUi();
}

function fullResolutionQuad() {
  const scaleX = state.background.width / canvas.width;
  const scaleY = state.background.height / canvas.height;
  return state.points.map(([x, y]) => [x * scaleX, y * scaleY]);
}

function renderExact(immediate = false) {
  if (!state.background || !state.asset || !validateCurrent()) {
    updateUi();
    return;
  }
  const started = beginRender(state);
  state = started.state;
  const id = started.version;
  exactRender.request({
    id,
    background: state.background,
    asset: state.asset,
    quad: fullResolutionQuad(),
    options: state.options,
  }, { immediate });
  updateUi();
}

canvas.addEventListener("pointerdown", (event) => {
  if (!backgroundCanvas) return;
  const point = pointForEvent(event);
  dragging = state.points.findIndex((current) =>
    Math.hypot(current[0] - point[0], current[1] - point[1]) <= 16);
  if (dragging >= 0) state = selectPoint(state, dragging);
  if (dragging < 0 && state.points.length < 4) {
    state = addPoint(state, point);
    dragging = state.points.length - 1;
  }
  exactRender.cancel();
  canvas.setPointerCapture(event.pointerId);
  validateCurrent();
  renderedCanvas = null;
  updateUi();
});

canvas.addEventListener("pointermove", (event) => {
  if (dragging < 0) return;
  const [x, y] = pointForEvent(event);
  state = movePoint(state, dragging, [
    Math.max(0, Math.min(canvas.width, x)),
    Math.max(0, Math.min(canvas.height, y)),
  ]);
  exactRender.cancel();
  validateCurrent();
  renderedCanvas = null;
  updateUi();
});

canvas.addEventListener("pointerup", () => {
  dragging = -1;
  if (validateCurrent()) renderExact(true);
  else updateUi();
});

byId("background-input").addEventListener("change", async (event) => {
  if (!event.target.files[0]) return;
  try {
    await setBackgroundImage(event.target.files[0]);
  } catch (error) {
    emptyMessage.hidden = false;
    emptyMessage.textContent = error.message;
  }
});
byId("asset-input").addEventListener("change", async (event) => {
  if (!event.target.files[0]) return;
  try {
    await setPngAsset(event.target.files[0]);
  } catch (error) {
    byId("render-status").textContent = error.message;
    return;
  }
  document.querySelectorAll("[data-asset-tab]").forEach((button) =>
    button.classList.toggle("active", button.dataset.assetTab === "png"));
});
byId("font-input").addEventListener("change", async (event) => {
  if (!event.target.files[0]) return;
  try {
    const installed = await installUploadedFont(
      event.target.files[0], "VisionHubUploaded", uploadedFontFace);
    uploadedFontFace = installed.face;
    fontFamily = `"${installed.family}"`;
    makeTextAsset();
  } catch (error) {
    const detail = error instanceof Error && error.message ? `：${error.message}` : "";
    byId("render-status").textContent = `字体加载失败${detail}`;
  }
});
["text-input", "font-size", "text-color"].forEach((id) =>
  byId(id).addEventListener("input", makeTextAsset));

document.querySelectorAll("[data-asset-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-asset-tab]").forEach((item) =>
      item.classList.toggle("active", item === button));
    if (button.dataset.assetTab === "text") makeTextAsset();
    else byId("asset-input").click();
  });
});

function syncControls() {
  byId("blend-mode").value = state.options.blendMode;
  byId("opacity").value = state.options.opacity;
  byId("texture").value = state.options.textureStrength;
  byId("tint").value = state.options.tintStrength;
  byId("blur").value = state.options.blurPx;
  byId("saturation").value = state.options.saturation;
  byId("fit-mode").value = state.options.fitMode;
  byId("brightness").checked = state.options.brightnessMatch;
  byId("shadow").checked = state.options.shadow.enabled;
  byId("shadow-x").value = state.options.shadow.offsetX;
  byId("shadow-y").value = state.options.shadow.offsetY;
  byId("shadow-blur").value = state.options.shadow.blur;
  byId("shadow-opacity").value = state.options.shadow.opacity;
  byId("opacity-value").textContent = `${Math.round(state.options.opacity * 100)}%`;
  byId("texture-value").textContent = `${Math.round(state.options.textureStrength * 100)}%`;
  byId("tint-value").textContent = `${Math.round(state.options.tintStrength * 100)}%`;
  byId("blur-value").textContent = `${Number(state.options.blurPx).toFixed(1)}px`;
  byId("saturation-value").textContent = `${Math.round(state.options.saturation * 100)}%`;
}

document.querySelectorAll("[data-option]").forEach((input) => {
  input.addEventListener("input", () => {
    const value = input.type === "checkbox" ? input.checked :
      ["range", "number"].includes(input.type) ? Number(input.value) : input.value;
    state = updateOption(state, input.dataset.option, value);
    renderedCanvas = null;
    syncControls();
    if (validateCurrent()) renderExact(input.type !== "range");
    else updateUi();
  });
});

byId("preset-select").addEventListener("change", (event) => {
  if (!presets[event.target.value]) return;
  state = applyPreset(state, event.target.value, presets[event.target.value]);
  renderedCanvas = null;
  syncControls();
  if (validateCurrent()) renderExact(true);
  else updateUi();
});

["grid-toggle", "vanishing-toggle"].forEach((id) =>
  byId(id).addEventListener("change", schedulePreview));

byId("compare-slider").addEventListener("input", (event) => {
  state = setCompare(state, Number(event.target.value) / 100);
  byId("compare-value").textContent = `${event.target.value}%`;
  schedulePreview();
});

const holdOriginal = (held) => {
  originalHeld = held;
  schedulePreview();
};
byId("original-button").addEventListener("pointerdown", () => holdOriginal(true));
["pointerup", "pointercancel", "pointerleave"].forEach((event) =>
  byId("original-button").addEventListener(event, () => holdOriginal(false)));

byId("reset-button").addEventListener("click", () => {
  state = resetEditor(state);
  exactRender.cancel();
  renderedCanvas = null;
  updateUi();
});

canvas.addEventListener("keydown", (event) => {
  const numeric = Number(event.key);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) {
    state = selectPoint(state, numeric - 1);
    byId("keyboard-status").textContent = state.selectedPoint === null
      ? `控制点 ${numeric} 尚未添加` : `已选择控制点 ${numeric}`;
    event.preventDefault();
    updateUi();
    return;
  }
  if (event.code === "Space" && state.points.length < 4) {
    state = addDefaultCorner(state, canvas.width, canvas.height);
    exactRender.cancel();
    byId("keyboard-status").textContent = `已添加控制点 ${state.points.length}`;
    event.preventDefault();
    validateCurrent();
    updateUi();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    const removed = state.selectedPoint;
    state = removeSelectedPoint(state);
    exactRender.cancel();
    renderedCanvas = null;
    byId("keyboard-status").textContent = removed === null
      ? "请先用数字键选择控制点" : `已删除控制点 ${removed + 1}`;
    event.preventDefault();
    validateCurrent();
    updateUi();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (validateCurrent()) renderExact(true);
    else updateUi();
    return;
  }
  const arrows = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (!arrows[event.key]) return;
  const step = event.shiftKey ? 10 : 1;
  state = nudgeSelectedPoint(
    state, arrows[event.key][0] * step, arrows[event.key][1] * step,
    canvas.width, canvas.height);
  exactRender.cancel();
  renderedCanvas = null;
  byId("keyboard-status").textContent = state.selectedPoint === null
    ? "请先用数字键选择控制点"
    : `控制点 ${state.selectedPoint + 1} 已移动 ${step} 像素`;
  event.preventDefault();
  validateCurrent();
  updateUi();
});

function exportImage(type) {
  if (!canExport(state) || !renderedCanvas) return;
  renderedCanvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vision-hub.${type === "image/png" ? "png" : "jpg"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }, type, type === "image/jpeg" ? .92 : undefined);
}
byId("export-png").addEventListener("click", () => exportImage("image/png"));
byId("export-jpeg").addEventListener("click", () => exportImage("image/jpeg"));

async function boot() {
  const response = await fetch("./shared/presets.json");
  if (!response.ok) throw new Error("预设加载失败");
  presets = (await response.json()).presets;
  state = applyPreset(state, "wall", presets.wall);
  syncControls();
  makeTextAsset();
  try {
    await setBackgroundImage("./assets/examples/wall.jpg");
    for (let index = 0; index < 4; index += 1) {
      state = addDefaultCorner(state, canvas.width, canvas.height);
    }
    if (validateCurrent()) renderExact(true);
  } catch (error) {
    emptyMessage.hidden = false;
    emptyMessage.textContent = `${error.message}。请从左侧选择一张背景图继续。`;
  }
}

boot();
