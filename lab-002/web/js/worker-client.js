import { StitchError, deserializeError } from "./errors.js";

const defaultWorkerFactory = () =>
  new Worker(new URL("./panorama.worker.js", import.meta.url));

function nextJobId() {
  return globalThis.crypto?.randomUUID?.() ??
    `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function closeBitmaps(bitmaps) {
  bitmaps?.forEach(({ bitmap }) => bitmap?.close());
}

export class StitchWorkerClient {
  constructor(factory = globalThis.__LAB002_WORKER_FACTORY__ ?? defaultWorkerFactory) {
    this.factory = factory;
    this.worker = null;
    this.active = null;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.factory();
    this.worker = worker;
    worker.addEventListener("message", (event) => {
      const active = this.active;
      if (
        worker !== this.worker ||
        !active ||
        event.data.jobId !== active.jobId
      ) {
        return;
      }
      if (event.data.type === "progress") {
        active.onProgress(event.data);
        return;
      }
      this.active = null;
      closeBitmaps(active.bitmaps);
      if (event.data.type === "result") {
        active.resolve(event.data.result);
      } else {
        active.reject(deserializeError(event.data.error));
      }
    });
    const rejectWorkerFailure = (event) => {
      if (worker !== this.worker || !this.active) return;
      event.preventDefault?.();
      const active = this.active;
      this.active = null;
      closeBitmaps(active.bitmaps);
      worker.terminate();
      this.worker = null;
      active.reject(new StitchError(
        "DECODE_FAILED",
        event.error?.message ?? event.message ?? "Worker communication failed.",
        { cause: event.error },
      ));
    };
    worker.addEventListener("error", rejectWorkerFailure);
    worker.addEventListener("messageerror", rejectWorkerFailure);
    return worker;
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
        closeBitmaps(bitmaps);
        throw error;
      }
    }
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.active = { jobId, resolve, reject, onProgress, bitmaps };
      try {
        worker.postMessage({
          type: "stitch",
          jobId,
          images: bitmaps,
          quality,
          options,
        }, bitmaps.map(({ bitmap }) => bitmap));
      } catch (error) {
        this.active = null;
        closeBitmaps(bitmaps);
        reject(error);
      }
    });
  }

  cancel() {
    const active = this.active;
    if (!active) return;
    this.active = null;
    closeBitmaps(active.bitmaps);
    this.worker?.terminate();
    this.worker = null;
    active.reject(new StitchError(
      "CANCELLED",
      "Panorama stitching was cancelled.",
    ));
  }

  close() {
    const active = this.active;
    this.active = null;
    closeBitmaps(active?.bitmaps);
    this.worker?.terminate();
    this.worker = null;
    active?.reject(new StitchError(
      "CANCELLED",
      "Panorama stitching was cancelled.",
    ));
  }
}
