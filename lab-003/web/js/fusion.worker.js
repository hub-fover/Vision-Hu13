let openCvPromise;
let openCvModule;
const cancelled = new Set();

function loadOpenCv() {
  if (openCvPromise) return openCvPromise;
  openCvPromise = new Promise((resolve, reject) => {
    let poll;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      callback(value);
    };
    const ready = (value) => {
      if (!value?.Mat) return;
      if (typeof value.ORB === "function" && typeof value.ORB.create !== "function") {
        const ORB = value.ORB;
        Object.defineProperty(ORB, "create", {
          configurable: true,
          value: (...args) => new ORB(...args),
          writable: true,
        });
      }
      openCvModule = value;
      finish(resolve, { module: openCvModule });
    };
    const timeout = setTimeout(() => finish(
      reject,
      new Error("OpenCV.js initialization timed out."),
    ), 90_000);
    self.Module = {
      onRuntimeInitialized() {
        ready(self.cv);
      },
    };
    try {
      importScripts("../vendor/opencv.js");
      poll = setInterval(() => {
        if (self.cv?.Mat) ready(self.cv);
      }, 25);
      if (self.cv?.then) {
        self.cv.then(ready, (error) => finish(reject, error));
      } else {
        self.cv.onRuntimeInitialized = () => ready(self.cv);
        if (self.cv.Mat) ready(self.cv);
      }
    } catch (error) { finish(reject, error); }
  });
  return openCvPromise;
}

function decodeAndResize(items, options, FusionError) {
  if (items.length !== 3) throw new FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.");
  const totalPixels = items.reduce((sum, item) => sum + item.bitmap.width * item.bitmap.height, 0);
  if (totalPixels > (options.maxInputMegapixels ?? 48) * 1_000_000) {
    throw new FusionError("OUTPUT_TOO_LARGE", "The source images exceed the input budget.");
  }
  const reference = items[1].bitmap;
  const referenceAspect = reference.width / reference.height;
  if (items.some(({ bitmap }) => Math.abs(bitmap.width / bitmap.height / referenceAspect - 1) > 0.03)) {
    throw new FusionError("SCENE_MISMATCH", "The three photos have different aspect ratios.");
  }
  const scale = Math.min(1, Math.sqrt((options.maxOutputPixels ?? 4_000_000) / (reference.width * reference.height)));
  const width = Math.max(1, Math.round(reference.width * scale));
  const height = Math.max(1, Math.round(reference.height * scale));
  return items.map(({ bitmap }) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { width, height, data: context.getImageData(0, 0, width, height).data };
  });
}

self.onmessage = async ({ data }) => {
  if (data.type === "cancel") { cancelled.add(data.jobId); return; }
  if (data.type !== "fuse") return;
  try {
    self.postMessage({ type: "progress", jobId: data.jobId, stage: "加载本地 OpenCV", progress: 0.02 });
    const [openCvReady, fusionModule, adapterModule, contractsModule, errorsModule] = await Promise.all([
      loadOpenCv(), import("./fusion.js"), import("./opencv-adapter.js"), import("./contracts.js"), import("./errors.js"),
    ]);
    const options = contractsModule.fusionOptions(data.options);
    const images = decodeAndResize(data.images, options, errorsModule.FusionError);
    const adapter = new adapterModule.OpenCvAdapter(openCvReady.module);
    const result = await fusionModule.fuseExposureImages(images, {
      adapter,
      options,
      isCancelled: () => cancelled.has(data.jobId),
      onProgress: ({ stage, progress }) => self.postMessage({ type: "progress", jobId: data.jobId, stage, progress }),
    });
    self.postMessage({ type: "result", jobId: data.jobId, result });
  } catch (error) {
    const { serializeError } = await import("./errors.js");
    self.postMessage({ type: "error", jobId: data.jobId, error: serializeError(error) });
  } finally { cancelled.delete(data.jobId); }
};
