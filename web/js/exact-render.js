export const MAX_INPUT_PIXELS = 8_294_400;

export function assertPixelLimit(width, height) {
  const pixels = Number(width) * Number(height);
  if (!Number.isFinite(pixels) || width <= 0 || height <= 0 ||
      pixels > MAX_INPUT_PIXELS) {
    throw new Error("图片超过 4K（8,294,400 像素）限制，请缩小图片后重试");
  }
}

export function createExactRenderController({
  createWorker,
  onResult,
  onError,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  debounceMs = 180,
}) {
  let timer = null;
  let activeWorker = null;

  function cancelActive() {
    if (!activeWorker) return;
    activeWorker.terminate();
    activeWorker = null;
  }

  function start(payload) {
    timer = null;
    cancelActive();
    const worker = createWorker();
    activeWorker = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== activeWorker) return;
      activeWorker = null;
      worker.terminate();
      if (data.error) onError(data.error, data.id);
      else onResult(data);
    };
    worker.onerror = (event) => {
      if (worker !== activeWorker) return;
      activeWorker = null;
      worker.terminate();
      onError(event.message || "渲染工作线程失败", payload.id);
    };
    worker.postMessage(payload);
  }

  function request(payload, { immediate = false } = {}) {
    try {
      assertPixelLimit(payload.background.width, payload.background.height);
      assertPixelLimit(payload.asset.width, payload.asset.height);
    } catch (error) {
      onError(error.message, payload.id);
      return false;
    }
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
    cancelActive();
    if (immediate) start(payload);
    else timer = setTimeoutFn(() => start(payload), debounceMs);
    return true;
  }

  function cancel() {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
    cancelActive();
  }

  return { request, cancel };
}
