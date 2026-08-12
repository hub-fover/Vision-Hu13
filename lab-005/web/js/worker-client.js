export function collectTransfers(type, payload) {
  const transfers = []; const seen = new Set();
  const collect = value => {
    if (!value || typeof value !== 'object') return;
    if (value.bitmap && typeof value.bitmap === 'object' && !seen.has(value.bitmap)) { seen.add(value.bitmap); transfers.push(value.bitmap); }
    if (Array.isArray(value)) value.forEach(collect); else Object.entries(value).forEach(([key, child]) => { if (key !== 'bitmap') collect(child); });
  };
  if (type === 'estimate' || type === 'analyzeStack' || type === 'calibrateIntrinsics') collect(payload?.frames || []);
  else if (type === 'calibrateScale') collect(payload);
  return transfers;
}

export class DefocusWorkerClient {
  constructor(url = new URL('./defocus.bootstrap.js', import.meta.url)) { this.worker = typeof Worker === 'undefined' ? null : new Worker(url); this.requests = new Map(); this.sequence = 0; this.worker?.addEventListener('message', event => { const { id, result, error, progress } = event.data; const request = this.requests.get(id); if (!request) return; if (error || result !== undefined) { this.requests.delete(id); error ? request.reject(Object.assign(new Error(error.message), error)) : request.resolve(result); } else if (progress !== undefined) request.onProgress?.(progress); }); }
  run(type, payload, onProgress) { if (!this.worker) return Promise.reject(Object.assign(new Error('Worker missing'), { code: 'RUNTIME_MISSING' })); const id = ++this.sequence; return new Promise((resolve, reject) => { this.requests.set(id, { resolve, reject, onProgress }); const transfer = collectTransfers(type, payload); this.worker.postMessage({ id, type, payload }, transfer); }); }
  cancel() { this.worker?.postMessage({ type: 'cancel' }); for (const request of this.requests.values()) request.reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' })); this.requests.clear(); }
  terminate() { this.cancel(); this.worker?.terminate(); this.worker = null; }
}
