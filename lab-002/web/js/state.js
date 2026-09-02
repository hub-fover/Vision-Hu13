import { stitchOptions } from "./contracts.js";

export function createQueueState() {
  return {
    images: [],
    status: "idle",
    autoCrop: null,
    crop: null,
    result: null,
  };
}

export function appendImages(state, images) {
  return { ...state, images: [...state.images, ...images] };
}

export function moveImage(state, id, direction) {
  const from = state.images.findIndex((image) => image.id === id);
  if (from < 0) return state;
  const to = Math.max(0, Math.min(state.images.length - 1, from + direction));
  if (from === to) return state;
  const images = [...state.images];
  const [item] = images.splice(from, 1);
  images.splice(to, 0, item);
  return { ...state, images };
}

export function reorderImages(state, sourceId, targetId) {
  const from = state.images.findIndex((image) => image.id === sourceId);
  const to = state.images.findIndex((image) => image.id === targetId);
  if (from < 0 || to < 0 || from === to) return state;
  const images = [...state.images];
  const [item] = images.splice(from, 1);
  images.splice(to, 0, item);
  return { ...state, images };
}

export function removeImage(state, id) {
  return {
    ...state,
    images: state.images.filter((image) => image.id !== id),
  };
}

export function warningMessages(images, overrides) {
  const options = stitchOptions(overrides);
  const messages = [];
  if (images.length > options.warningThresholds.imageCount) {
    messages.push(
      `已选择 ${images.length} 张，建议先用不超过 ${options.warningThresholds.imageCount} 张练习。`,
    );
  }
  const megapixels = images.reduce(
    (total, image) => total + image.width * image.height,
    0,
  ) / 1_000_000;
  if (megapixels > options.warningThresholds.sourceMegapixels) {
    messages.push(
      `源照片合计 ${megapixels.toFixed(1)}MP，超过 ${options.warningThresholds.sourceMegapixels}MP，导出时可能自动缩小。`,
    );
  }
  return messages;
}

export function setCrop(state, requested) {
  if (!state.autoCrop) return state;
  const safe = state.autoCrop;
  const safeRight = safe.x + safe.width;
  const safeBottom = safe.y + safe.height;
  const x = Math.max(safe.x, Math.min(requested.x, safeRight - 1));
  const y = Math.max(safe.y, Math.min(requested.y, safeBottom - 1));
  const requestedRight = requested.x + requested.width;
  const requestedBottom = requested.y + requested.height;
  const right = Math.max(x + 1, Math.min(safeRight, requestedRight));
  const bottom = Math.max(y + 1, Math.min(safeBottom, requestedBottom));
  return {
    ...state,
    crop: { x, y, width: right - x, height: bottom - y },
  };
}
