import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const source = resolve(scriptDirectory, "../web");
const figureSource = resolve(scriptDirectory, "../assets/figures");
const defaultDestination = resolve(scriptDirectory, "../../web/lab-003");
const excluded = new Set(["node_modules", "package.json", "package-lock.json", ".gitignore", "README.md", "manifest.local.json", "test-results"]);
const figures = [
  "01-exposure-comparison.jpg", "02-histogram.jpg", "03-exposure-metrics.jpg", "04-feature-matches.jpg", "05-alignment.jpg",
  "06-three-weights.jpg", "07-normalized-weights.jpg", "08-pyramid.jpg", "09-motion-mask.jpg", "10-boundaries.jpg",
];
const required = [
  "index.html", "article-copy.html", "styles.css", "vendor/opencv.js", "assets/samples/manifest.json",
  "assets/samples/peyrou/under.jpg", "assets/samples/peyrou/mean.jpg", "assets/samples/peyrou/over.jpg",
  ...figures.map((name) => `assets/figures/${name}`),
  ...["alignment", "analysis", "app", "capture", "contracts", "crop", "errors", "fusion", "motion", "opencv-adapter", "pyramid", "state", "weights", "worker-client"].map((name) => `js/${name}.js`),
  "js/fusion.worker.js",
];

async function files(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, path));
    if (entry.isFile()) result.push(relative(root, path).split(sep).join("/"));
  }
  return result.sort();
}

function safe(destination) {
  const target = resolve(destination);
  const child = relative(resolve(tmpdir()), target);
  if (target !== defaultDestination && (child === "" || child.startsWith("..") || isAbsolute(child))) {
    throw new Error(`unsafe LAB 003 staging destination: ${target}`);
  }
  return target;
}

export async function validatePagesStage(destination = defaultDestination) {
  const root = resolve(destination);
  const missing = [];
  for (const path of required) {
    try { if (!(await stat(resolve(root, path))).isFile()) throw new Error(); }
    catch { missing.push(path); }
  }
  if (missing.length) throw new Error(missing.map((path) => `missing staged asset: ${path}`).join("\n"));
  const runtime = (await files(root)).filter((path) => path === "index.html" || path === "styles.css" || path.startsWith("js/"));
  for (const path of runtime) {
    const content = await readFile(resolve(root, path), "utf8");
    if (/https?:\/\//i.test(content)) throw new Error(`remote runtime reference in ${path}`);
    if (/(?:src|href)=["']\/(?!\/)/i.test(content)) throw new Error(`root-absolute resource in ${path}`);
  }
  const html = await readFile(resolve(root, "index.html"), "utf8");
  if (/<script[^>]+opencv\.js/i.test(html)) throw new Error("OpenCV.js must remain Worker-lazy-loaded");
  const worker = await readFile(resolve(root, "js/fusion.worker.js"), "utf8");
  if (!worker.includes('importScripts("../vendor/opencv.js")')) throw new Error("Worker must load same-origin OpenCV.js");
  const opencvGzipBytes = gzipSync(await readFile(resolve(root, "vendor/opencv.js")), { level: 9, mtime: 0 }).byteLength;
  if (opencvGzipBytes > 8 * 1024 * 1024) throw new Error(`OpenCV.js exceeds 8MiB: ${opencvGzipBytes}`);
  const copyPage = await readFile(resolve(root, "article-copy.html"), "utf8");
  if (!copyPage.includes('id="copy-button"') || !copyPage.includes("navigator.clipboard")) {
    throw new Error("article-copy.html must expose the clipboard action");
  }
  const publicFigurePattern = /https:\/\/hub-fover\.github\.io\/Vision-Hu13\/lab-003\/(assets\/figures\/[^"']+)/g;
  const publicFigures = [...copyPage.matchAll(publicFigurePattern)].map((match) => match[1]);
  if (publicFigures.length !== 10) {
    throw new Error("article-copy.html must reference all ten public figures");
  }
  for (const path of publicFigures) {
    try { if (!(await stat(resolve(root, path))).isFile()) throw new Error(); }
    catch { throw new Error(`copy-page figure missing from Pages staging: ${path}`); }
  }
  if (/<script[^>]+src=["']https?:\/\//i.test(copyPage)) throw new Error("article-copy.html must not load remote scripts");
  return { files: await files(root), opencvGzipBytes };
}

export async function stagePages(destination = defaultDestination) {
  const target = safe(destination);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, filter: (path) => path === source || !excluded.has(path.split(/[\\/]/).at(-1)) });
  await cp(figureSource, resolve(target, "assets/figures"), { recursive: true });
  return validatePagesStage(target);
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args[0] === "--validate-only";
  const destination = resolve(scriptDirectory, args[validateOnly ? 1 : 0] || "../../web/lab-003");
  const report = validateOnly ? await validatePagesStage(destination) : await stagePages(destination);
  process.stdout.write(`LAB 003 Pages: PASS (${report.files.length} files, OpenCV gzip ${report.opencvGzipBytes} bytes)\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
