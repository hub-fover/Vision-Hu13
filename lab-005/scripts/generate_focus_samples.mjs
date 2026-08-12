import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(labRoot, "web/assets/samples");
const sourceCommit = "0d893bb456a819201ec001cda446230a4a1d2d08";
const frames = [
  { id: "focus-near", label: "NEAR", focusPosition: "near", blur: [0, 2, 4] },
  { id: "focus-near-mid", label: "NEAR MID", focusPosition: "near-mid", blur: [1, 1, 3] },
  { id: "focus-mid", label: "MID", focusPosition: "mid", blur: [2, 0, 2] },
  { id: "focus-far-mid", label: "FAR MID", focusPosition: "far-mid", blur: [3, 1, 1] },
  { id: "focus-far", label: "FAR", focusPosition: "far", blur: [4, 2, 0] },
];

const applyBlur = (value) => value ? ` filter="url(#b${value})"` : "";

function svg(frame) {
  const filters = [...new Set(frame.blur.filter(Boolean))]
    .sort((left, right) => left - right)
    .map(value => `<filter id="b${value}"><feGaussianBlur stdDeviation="${value}"/></filter>`)
    .join("");
  const [near, middle, far] = frame.blur;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><defs>${filters}</defs><rect width="960" height="640" fill="#eef2f1"/><g${applyBlur(near)}><rect x="75" y="220" width="230" height="260" rx="12" fill="#e65d4f"/><path d="M95 245h190M95 270h190M95 295h190M95 320h190M95 345h190M95 370h190M95 395h190M95 420h190M95 445h190" stroke="#fff" stroke-width="6"/></g><g${applyBlur(middle)}><circle cx="500" cy="330" r="118" fill="#d6b44d"/><path d="M420 330h160M500 250v160M443 273l114 114M557 273L443 387" stroke="#fff" stroke-width="7"/></g><g${applyBlur(far)}><rect x="700" y="255" width="165" height="195" fill="#4f7fe6"/><path d="M720 280h125v145H720zM745 280v145M770 280v145M795 280v145M820 280v145" fill="none" stroke="#fff" stroke-width="5"/></g><text x="32" y="58" font-family="sans-serif" font-size="34" fill="#20252b">LAB 005 ${frame.label}</text></svg>\n`;
}

await mkdir(output, { recursive: true });
const generatedFrames = [];
for (const frame of frames) {
  const path = `${frame.id}.svg`;
  const content = svg(frame);
  await writeFile(resolve(output, path), content, "utf8");
  generatedFrames.push({
    id: frame.id,
    label: frame.label,
    focusPosition: frame.focusPosition,
    path,
    sha256: createHash("sha256").update(content, "utf8").digest("hex").toUpperCase(),
  });
}

const manifest = {
  schema: "lab005.samples.v1",
  title: "离焦测深合成焦点样例",
  description: "确定性本地样例，用于演示近焦到远焦的清晰度变化。",
  license: "MIT",
  source: "Repository-original deterministic SVG generator",
  generator: { path: "scripts/generate_focus_samples.mjs", sourceCommit },
  checksumEncoding: "utf8-lf",
  generated: true,
  frames: generatedFrames,
};
await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`LAB 005 samples: generated ${generatedFrames.length} deterministic frames\n`);
