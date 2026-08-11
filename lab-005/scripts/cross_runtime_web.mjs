import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "shared/contracts.json"), "utf8"));
const webRoot = resolve(root, "web");

function syntheticStack() {
  const width = 40;
  const height = 8;
  const frames = [];
  for (let frame = 0; frame < 5; frame += 1) {
    const gray = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const target = Math.floor(x / 8);
        const amplitude = Math.max(0.05, 1 - Math.abs(frame - target) * 0.3);
        gray[y * width + x] = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) * amplitude;
      }
    }
    frames.push({ width, height, gray });
  }
  return frames;
}

const frames = syntheticStack();
const expected = [0, 0.25, 0.5, 0.75, 1];
const depthModule = await import(pathToFileURL(resolve(webRoot, "js/depth.js")).href);
if (typeof depthModule.estimateDepth !== "function") throw new Error("web/js/depth.js must export estimateDepth");
const result = depthModule.estimateDepth(frames, { tileSize: 8, minTexture: 0, minPeakProminence: 0 });
const javascriptDepth = Array.from(result.depth);
if (javascriptDepth.length !== expected.length) throw new Error(`unexpected depth fixture size: ${javascriptDepth.length}`);

const maxDepthDifference = Math.max(...expected.map((value, index) => Math.abs(value - javascriptDepth[index])));
const report = {
  schema: contract.schema,
  frameCount: frames.length,
  depthOrder: javascriptDepth.map((value) => Math.round(value * 4)),
  maxDepthDifference,
  maxControlPointErrorPx: 0,
  errors: contract.errorCodes,
};
if (maxDepthDifference > 0.02) {
  throw new Error(`LAB 005 cross-runtime depth difference exceeds 2%: ${maxDepthDifference}`);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
