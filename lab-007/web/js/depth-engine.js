function abortError() {
  return new DOMException('Depth inference cancelled', 'AbortError');
}

export function createDepthEngine({ workerUrl, WorkerClass = globalThis.Worker } = {}) {
  if (!workerUrl) throw new TypeError('workerUrl is required');
  if (typeof WorkerClass !== 'function') throw new TypeError('Worker is not available');

  const worker = new WorkerClass(workerUrl, { type: 'module', name: 'lab007-depth' });
  let sequence = 0;
  let active = null;

  const finish = (request, callback) => {
    request.signal?.removeEventListener('abort', request.abortListener);
    if (active === request) active = null;
    callback();
  };

  worker.addEventListener('message', event => {
    const message = event.data || {};
    if (!active || message.requestId !== active.requestId) return;
    if (message.type === 'progress') {
      active.onProgress(message.progress || {});
      return;
    }
    const request = active;
    if (message.type === 'error') {
      finish(request, () => request.reject(new Error(message.message || '深度模型运行失败')));
      return;
    }
    if (message.type === 'result') {
      const depth = message.depth instanceof ArrayBuffer ? new Float32Array(message.depth) : new Float32Array(message.depth || []);
      if (!Number.isInteger(message.width) || !Number.isInteger(message.height) || depth.length !== message.width * message.height) {
        finish(request, () => request.reject(new Error('模型返回了无效的深度矩阵')));
        return;
      }
      finish(request, () => request.resolve({
        width: message.width,
        height: message.height,
        depth,
        model: message.model,
        revision: message.revision,
        backend: message.backend,
        mode: 'relative',
      }));
    }
  });

  worker.addEventListener('error', event => {
    if (!active) return;
    const request = active;
    finish(request, () => request.reject(new Error(event.message || '深度 Worker 运行失败')));
  });

  function cancel() {
    if (!active) return;
    const request = active;
    worker.postMessage({ type: 'cancel', requestId: request.requestId });
    finish(request, () => request.reject(abortError()));
  }

  function infer(blob, { signal, onProgress = () => {} } = {}) {
    if (!(blob instanceof Blob)) return Promise.reject(new TypeError('image Blob is required'));
    cancel();
    const requestId = `depth-${Date.now()}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const request = { requestId, resolve, reject, signal, onProgress, abortListener: null };
      request.abortListener = () => cancel();
      active = request;
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener('abort', request.abortListener, { once: true });
      worker.postMessage({ type: 'infer', requestId, blob });
    });
  }

  function dispose() {
    cancel();
    worker.terminate();
  }

  return { infer, cancel, dispose };
}
