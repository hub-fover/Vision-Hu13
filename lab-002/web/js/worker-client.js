import { deserializeError } from "./errors.js";

const defaultWorkerFactory = () =>
  new Worker(new URL("./panorama.worker.js", import.meta.url));

function nextJobId() {
  return globalThis.crypto?.randomUUID?.() ??
    `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class StitchWorkerClient {
  constructor(factory = globalThis.__LAB002_WORKER_FACTORY__ ?? defaultWorkerFactory) {
    this.worker = factory();
    this.active = null;
    this.worker.addEventListener("message", (event) => {
      const active = this.active;
      if (!active || event.data.jobId !== active.jobId) return;
      if (event.data.type === "progress") {
        active.onProgress(event.data);
        return;
      }
      this.active = null;
      if (event.data.type === "result") {
        active.resolve(event.data.result);
      } else {
        active.reject(deserializeError(event.data.error));
      }
    });
  }

  async stitch(images, {
    quality = "mobile",
    options,
    onProgress = () => {},
  } = {}) {
    if (this.active) {
      throw new Error("A stitch job is already active.");
    }
    const jobId = nextJobId();
    const bitmaps = [];
    for (const image of images) {
      try {
        bitmaps.push({
          name: image.name,
          bitmap: await createImageBitmap(image.file, {
            imageOrientation: "from-image",
          }),
        });
      } catch (error) {
        bitmaps.forEach(({ bitmap }) => bitmap.close());
        throw error;
      }
    }
    return new Promise((resolve, reject) => {
      this.active = { jobId, resolve, reject, onProgress };
      this.worker.postMessage({
        type: "stitch",
        jobId,
        images: bitmaps,
        quality,
        options,
      }, bitmaps.map(({ bitmap }) => bitmap));
    });
  }

  cancel() {
    if (!this.active) return;
    this.worker.postMessage({ type: "cancel", jobId: this.active.jobId });
  }

  close() {
    this.worker.terminate();
    this.active = null;
  }
}
