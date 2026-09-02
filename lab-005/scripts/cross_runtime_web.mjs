import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "shared/contracts.json"), "utf8"));
const depthModule = await import(pathToFileURL(resolve(root, "web/js/depth.js")).href);

// Five tiles deliberately exercise boundary peaks, quadratic interpolation,
// a depth discontinuity and a low-confidence invalid tile.
const scores = [
  [0.90, 0.35, 0.10, 0.10, 0.10],
  [0.25, 0.90, 0.35, 0.15, 0.10],
  [0.10, 0.30, 0.90, 0.30, 0.10],
  [0.10, 0.15, 0.35, 0.90, 0.25],
  [0.10, 0.10, 0.10, 0.35, 0.90],
];
const texture = [0.15, 0.15, 0.03, 0.15, 0.15];
const curves = Array.from({ length: 5 }, (_, frame) => Float32Array.from(scores.map(tile => tile[frame])));
const javascript = depthModule.estimateDepthFromScores(curves, 1, 5, { texture });

function pythonExecutable() {
  const candidates = [
    process.env.PYTHON,
    resolve(root, "../../.venv/Scripts/python.exe"),
    resolve(root, "../../../.venv/Scripts/python.exe"),
    "python",
  ].filter(Boolean);
  return candidates.find(candidate => candidate === "python" || existsSync(candidate));
}

const pythonCode = String.raw`
import json, sys
import numpy as np
from defocus_depth.depth import estimate_relative_depth
from defocus_depth.errors import DefocusDepthError

payload = json.load(sys.stdin)
scores = np.asarray(payload["scores"], dtype=np.float32).T.reshape(5, 1, -1)
texture = np.asarray(payload["texture"], dtype=np.float32).reshape(1, -1)
result = estimate_relative_depth(scores, texture=texture)
def code_for(value, texture_value):
    try:
        estimate_relative_depth(value, texture=texture_value)
    except DefocusDepthError as error:
        return error.code
    return None
error_codes = {
    "INVALID_FRAME_COUNT": code_for(np.zeros((4, 1, 1), dtype=np.float32), np.ones((1, 1), dtype=np.float32)),
    "LOW_TEXTURE": code_for(np.zeros((5, 1, 1), dtype=np.float32), np.zeros((1, 1), dtype=np.float32)),
    "LOW_PEAK_PROMINENCE": code_for(np.full((5, 1, 1), 0.2, dtype=np.float32), np.ones((1, 1), dtype=np.float32) * 0.15),
}
print(json.dumps({
    "depth": result.depth.ravel().tolist(),
    "confidence": result.confidence.ravel().tolist(),
    "invalid": (~result.valid).astype(np.uint8).ravel().tolist(),
    "peakIndex": result.peak_index.ravel().tolist(),
    "errorCodes": error_codes,
}))
`;
const python = spawnSync(pythonExecutable(), ["-c", pythonCode], {
  cwd: resolve(root, "python"), input: JSON.stringify({ scores, texture }), encoding: "utf8",
});
if (python.status !== 0) throw new Error(`Python cross-runtime fixture failed: ${python.stderr || python.error}`);
const reference = JSON.parse(python.stdout);

const maxDifference = (left, right) => Math.max(...left.map((value, index) => Math.abs(value - right[index])));
const javascriptErrorCodes = {
  INVALID_FRAME_COUNT: (() => { try { depthModule.estimateDepthFromScores([], 1, 1); } catch (error) { return error.code; } return null; })(),
  LOW_TEXTURE: (() => { try { depthModule.estimateDepthFromScores(Array.from({ length: 5 }, () => Float32Array.of(0)), 1, 1, { texture: Float32Array.of(0) }); } catch (error) { return error.code; } return null; })(),
  LOW_PEAK_PROMINENCE: (() => { try { depthModule.estimateDepthFromScores(Array.from({ length: 5 }, () => Float32Array.of(0.2)), 1, 1, { texture: Float32Array.of(0.15) }); } catch (error) { return error.code; } return null; })(),
};
const javascriptDepth = Array.from(javascript.depth);
const javascriptConfidence = Array.from(javascript.confidence);
const javascriptInvalid = Array.from(javascript.invalid);
const maxDepthDifference = maxDifference(javascriptDepth, reference.depth);
const maxConfidenceDifference = maxDifference(javascriptConfidence, reference.confidence);
const maxPeakIndexDifference = maxDifference(Array.from(javascript.peakIndex), reference.peakIndex);
const invalidMaskMismatchCount = javascriptInvalid.filter((value, index) => value !== reference.invalid[index]).length;
const errorCodeMismatchCount = Object.keys(reference.errorCodes).filter(key => javascriptErrorCodes[key] !== reference.errorCodes[key]).length;

if (maxDepthDifference > 1e-6) throw new Error(`Python/JavaScript depth difference exceeds tolerance: ${maxDepthDifference}`);
if (maxConfidenceDifference > 1e-6) throw new Error(`Python/JavaScript confidence difference exceeds tolerance: ${maxConfidenceDifference}`);
if (maxPeakIndexDifference > 1e-6) throw new Error(`Python/JavaScript peak difference exceeds tolerance: ${maxPeakIndexDifference}`);
if (invalidMaskMismatchCount) throw new Error(`Python/JavaScript invalid mask differs at ${invalidMaskMismatchCount} tiles`);
if (errorCodeMismatchCount) throw new Error(`Python/JavaScript error codes differ: ${JSON.stringify(reference.errorCodes)} / ${JSON.stringify(javascriptErrorCodes)}`);

process.stdout.write(`${JSON.stringify({
  schema: contract.schema,
  frameCount: 5,
  depthOrder: Array.from(javascript.peakIndex, value => Math.round(value)),
  maxDepthDifference,
  maxConfidenceDifference,
  maxPeakIndexDifference,
  invalidMaskMismatchCount,
  errorCodeMismatchCount,
  comparedErrorCodes: javascriptErrorCodes,
  errors: contract.errorCodes,
}, null, 2)}\n`);
