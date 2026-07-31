import { FusionError, deserializeError } from "./errors.js";

const defaultWorkerFactory = () => new Worker(new URL("./fusion.worker.js", import.meta.url));
const jobId = () => globalThis.crypto?.randomUUID?.() ?? `fusion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const closeBitmaps = (items) => items?.forEach(({ bitmap }) => { try { bitmap?.close(); } catch {} });

export class FusionWorkerClient {
  constructor(factory = globalThis.__LAB003_WORKER_FACTORY__ ?? defaultWorkerFactory) {
    this.factory = factory;
    this.worker = null;
    this.active = null;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.factory();
    this.worker = worker;
    worker.addEventListener("message", ({ data }) => {
      if (!this.active || data.jobId !== this.active.jobId) return;
      if (data.type === "progress") {
        this.active.onProgress(data);
        return;
      }
      const active = this.active;
      this.active = null;
      closeBitmaps(active.bitmaps);
      if (data.type === "result") active.resolve(data.result);
      else active.reject(deserializeError(data.error));
    });
    const failed = (event) => {
      if (!this.active) return;
      event.preventDefault?.();
      const active = this.active;
      this.active = null;
      this.worker?.terminate();
      this.worker = null;
      closeBitmaps(active.bitmaps);
      active.reject(new FusionError("DECODE_FAILED", event.message ?? "Worker failed."));
    };
    worker.addEventListener("error", failed);
    worker.addEventListener("messageerror", failed);
    return worker;
  }

  async fuse(files, { options, onProgress = () => {} } = {}) {
    if (this.active) throw new Error("A fusion job is already active.");
    if (files.length !== 3 || files.some((file) => !file)) throw new FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.");
    const bitmaps = [];
    let rejectDecoding;
    const decodingCancelled = new Promise((_, reject) => { rejectDecoding = reject; });
    const active = { jobId: null, bitmaps, resolve: null, reject: rejectDecoding, onProgress };
    this.active = active;
    try {
      for (const file of files) {
        const decoding = createImageBitmap(file, { imageOrientation: "from-image" });
        decoding.then((bitmap) => {
          if (this.active !== active) closeBitmaps([{ bitmap }]);
        }, () => {});
        const bitmap = await Promise.race([decoding, decodingCancelled]);
        bitmaps.push({ name: file.name, bitmap });
      }
    } catch (error) {
      if (this.active === active) this.active = null;
      closeBitmaps(bitmaps);
      if (error.code === "CANCELLED") throw error;
      throw new FusionError("DECODE_FAILED", error.message, { cause: error });
    }
    const currentJobId = jobId();
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      Object.assign(active, { jobId: currentJobId, resolve, reject });
      worker.postMessage({ type: "fuse", jobId: currentJobId, images: bitmaps, options }, bitmaps.map(({ bitmap }) => bitmap));
    });
  }

  cancel() {
    if (!this.active) return;
    const active = this.active;
    this.active = null;
    this.worker?.terminate();
    this.worker = null;
    closeBitmaps(active.bitmaps);
    active.reject(new FusionError("CANCELLED", "Exposure fusion was cancelled."));
  }

  close() { this.cancel(); }
}
