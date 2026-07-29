let openCvPromise;
let activeJobId = null;
const cancelledJobs = new Set();

function loadOpenCv() {
  if (openCvPromise) return openCvPromise;
  openCvPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("OpenCV.js initialization timed out.")),
      30_000,
    );
    self.Module = {
      onRuntimeInitialized() {
        clearTimeout(timeout);
        resolve(self.cv);
      },
    };
    try {
      importScripts("../vendor/opencv.js");
      if (self.cv?.then) {
        self.cv.then((value) => {
          clearTimeout(timeout);
          self.cv = value;
          resolve(value);
        }, reject);
      } else if (self.cv?.Mat) {
        clearTimeout(timeout);
        resolve(self.cv);
      }
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
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
    const [cv, panoramaModule, adapterModule, errorModule] = await Promise.all([
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
    const adapter = new adapterModule.OpenCvAdapter(cv);
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
    cancelledJobs.delete(data.jobId);
    if (activeJobId === data.jobId) activeJobId = null;
  }
};
