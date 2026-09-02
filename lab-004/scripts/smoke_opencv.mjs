import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const artifact = resolve(process.argv[2] ?? fileURLToPath(new URL("../web/vendor/opencv.js", import.meta.url)));

try {
  await access(artifact);
} catch {
  console.error(`BUILD_PREREQUISITE: generated OpenCV.js is absent at ${artifact}. Run the pinned Docker build in CI first.`);
  process.exitCode = 2;
}

if (process.exitCode === 2) process.exit();

const source = await readFile(artifact, "utf8");
if (/https?:\/\//i.test(source)) {
  throw new Error("OpenCV.js contains a remote runtime reference; single-file same-origin output is required");
}

const module = await import(pathToFileURL(artifact).href);
const factory = module.default ?? module.cv ?? module;
const cv = typeof factory === "function" ? await factory() : factory;
if (!cv?.Mat) throw new Error("OpenCV.js factory did not expose cv.Mat");

const owned = [];
const own = (value) => (owned.push(value), value);
try {
  const input = own(new cv.Mat(2, 2, cv.CV_8UC1));
  const output = own(new cv.Mat());
  own(new cv.MatVector());
  cv.resize(input, output, new cv.Size(2, 2));
  const rgba = own(new cv.Mat(1, 1, cv.CV_8UC4));
  const gray = own(new cv.Mat());
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

  const rvec = own(new cv.Mat(3, 1, cv.CV_64F));
  const rotation = own(new cv.Mat());
  cv.Rodrigues(rvec, rotation);

  const required = [
    "solvePnPGeneric", "solvePnP", "solvePnPRefineLM", "calibrateCamera",
    "calibrateCameraExtended", "findChessboardCorners", "cornerSubPix",
    "goodFeaturesToTrack", "calcOpticalFlowPyrLK", "findHomography", "Rodrigues",
    "projectPoints", "perspectiveTransform", "cvtColor", "Laplacian", "GaussianBlur", "resize",
  ];
  const missing = required.filter((name) => typeof cv[name] !== "function");
  if (missing.length) throw new Error(`OpenCV.js whitelist symbols missing: ${missing.join(", ")}`);
  console.log(`OpenCV.js smoke PASS: ${required.length} critical symbols and core/imgproc fixture exercised.`);
} finally {
  for (const value of owned.reverse()) value?.delete?.();
}
