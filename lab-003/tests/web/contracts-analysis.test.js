import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeExposures } from "../../web/js/analysis.js";
import { DEFAULTS, ERROR_CODES } from "../../web/js/contracts.js";

function flat(value) {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([value, value, value, 255], offset);
  return { width: 8, height: 8, data };
}

test("browser defaults and error codes match the shared contract", async () => {
  const shared = JSON.parse(await readFile(new URL("../../shared/contracts.json", import.meta.url)));
  assert.deepEqual(DEFAULTS, shared.defaults);
  assert.deepEqual(ERROR_CODES, shared.errorCodes);
});

test("exposures are sorted dark to bright regardless of input order", () => {
  const report = analyzeExposures([flat(220), flat(35), flat(120)]);
  assert.deepEqual(report.orderedIndices, [1, 2, 0]);
  assert.ok(report.relativeSpread > 2);
});

test("too-small exposure spread has a stable error code", () => {
  assert.throws(() => analyzeExposures([flat(100), flat(105), flat(110)]), { code: "EXPOSURE_SPREAD_TOO_SMALL" });
});
