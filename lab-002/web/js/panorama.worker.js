let openCvPromise;
let openCvModule;
let activeJobId = null;
const cancelledJobs = new Set();

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
    } catch (error) {
      finish(reject, error);
    }
  });
  return openCvPromise;
}

self.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    cancelledJobs.add(data.jobId);
    return;
  }
  if (data.type !== "stitch") return;
  activeJobId = data.jobId;
  try {
    self.postMessage({
      type: "progress",
      jobId: data.jobId,
      stage: "加载 OpenCV",
      progress: 0.01,
    });
    const [
      openCvReady,
      panoramaModule,
      adapterModule,
      errorModule,
    ] = await Promise.all([
      loadOpenCv(),
      import("./panorama.js"),
      import("./opencv-adapter.js"),
      import("./errors.js"),
    ]);
    if (cancelledJobs.has(data.jobId)) {
      throw new errorModule.StitchError(
        "CANCELLED",
        "Panorama stitching was cancelled.",
      );
    }
    const adapter = new adapterModule.OpenCvAdapter(openCvReady.module);
    const result = await panoramaModule.stitchImages(data.images, {
      adapter,
      options: data.options,
      quality: data.quality,
      isCancelled: () => cancelledJobs.has(data.jobId),
      onProgress: ({ stage, progress }) => {
        self.postMessage({
          type: "progress",
          jobId: data.jobId,
          stage,
          progress,
        });
      },
    });
    self.postMessage({ type: "result", jobId: data.jobId, result });
  } catch (error) {
    const { serializeError } = await import("./errors.js");
    self.postMessage({
      type: "error",
      jobId: data.jobId,
      error: serializeError(error),
    });
  } finally {
    data.images?.forEach(({ bitmap }) => bitmap?.close());
    cancelledJobs.delete(data.jobId);
    if (activeJobId === data.jobId) activeJobId = null;
  }
};
