import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const labRoot = resolve(scriptDirectory, "..");
const source = resolve(labRoot, "web");
const defaultDestination = resolve(scriptDirectory, "../../web/lab-002");
const excluded = new Set([
  "node_modules",
  "package.json",
  "package-lock.json",
  ".gitignore",
  "README.md",
  "manifest.local.json",
]);
const requiredRuntimeFiles = [
  "index.html",
  "styles.css",
  "js/app.js",
  "js/contracts.js",
  "js/crop.js",
  "js/errors.js",
  "js/geometry.js",
  "js/opencv-adapter.js",
  "js/panorama.js",
  "js/panorama.worker.js",
  "js/state.js",
  "js/worker-client.js",
  "vendor/opencv.js",
  "assets/samples/manifest.json",
];

async function allFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...await allFiles(root, path));
    if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
}

function assertDestination(destination) {
  const resolved = resolve(destination);
  if (
    resolved === source ||
    resolved === labRoot ||
    dirname(resolved) === resolved
  ) {
    throw new Error(`unsafe LAB 002 staging destination: ${resolved}`);
  }
  return resolved;
}

export async function validatePagesStage(destination = defaultDestination) {
  const root = resolve(destination);
  const missing = [];
  for (const required of requiredRuntimeFiles) {
    try {
      if (!(await stat(resolve(root, required))).isFile()) throw new Error();
    } catch {
      missing.push(required);
    }
  }

  let sampleManifest = { sequences: {} };
  if (!missing.includes("assets/samples/manifest.json")) {
    sampleManifest = JSON.parse(
      await readFile(resolve(root, "assets/samples/manifest.json"), "utf8"),
    );
    for (const sequence of Object.values(sampleManifest.sequences ?? {})) {
      for (const sample of sequence.files ?? []) {
        const samplePath = resolve(root, "assets/samples", sample);
        try {
          if (!(await stat(samplePath)).isFile()) throw new Error();
        } catch {
          missing.push(
            relative(root, samplePath).split(sep).join("/"),
          );
        }
      }
    }
  }
  if (missing.length) {
    throw new Error(
      [...new Set(missing)]
        .map((path) => `missing staged asset: ${path}`)
        .join("\n"),
    );
  }

  const runtimeFiles = (await allFiles(root)).filter((path) =>
    path === "index.html" || path === "styles.css" || path.startsWith("js/"));
  const remoteRuntimeReferences = [];
  const unsafeSubpathReferences = [];
  for (const path of runtimeFiles) {
    const contents = await readFile(resolve(root, path), "utf8");
    if (/https?:\/\//i.test(contents)) remoteRuntimeReferences.push(path);
    if (/(?:src|href)=["']\/(?!\/)/i.test(contents)) {
      unsafeSubpathReferences.push(path);
    }
  }
  if (remoteRuntimeReferences.length) {
    throw new Error(
      `remote runtime reference in ${remoteRuntimeReferences.join(", ")}`,
    );
  }
  if (unsafeSubpathReferences.length) {
    throw new Error(
      `root-absolute resource is not subpath-safe: ${unsafeSubpathReferences.join(", ")}`,
    );
  }

  const worker = await readFile(resolve(root, "js/panorama.worker.js"), "utf8");
  if (!worker.includes('importScripts("../vendor/opencv.js")')) {
    throw new Error("Worker does not load staged same-origin OpenCV.js");
  }
  const html = await readFile(resolve(root, "index.html"), "utf8");
  if (/<script[^>]+src=["'][^"']*opencv\.js/i.test(html)) {
    throw new Error("OpenCV.js must remain lazy-loaded by the Worker");
  }
  const opencvGzipBytes = gzipSync(
    await readFile(resolve(root, "vendor/opencv.js")),
    { level: 9, mtime: 0 },
  ).byteLength;
  if (opencvGzipBytes > 8 * 1024 * 1024) {
    throw new Error(`compressed OpenCV.js exceeds 8MiB: ${opencvGzipBytes}`);
  }

  const article = await readFile(resolve(labRoot, "article/article.md"), "utf8");
  const runtimeLink = article.match(
    /https:\/\/hub-fover\.github\.io\/Vision-Hu13\/(lab-002\/)/,
  );
  if (!runtimeLink) {
    throw new Error("article does not link the staged LAB 002 runtime");
  }
  return {
    files: await allFiles(root),
    missing: [],
    remoteRuntimeReferences,
    unsafeSubpathReferences,
    articleRuntimePath: runtimeLink[1],
    opencvGzipBytes,
  };
}

export async function stagePages(destination = defaultDestination) {
  const target = assertDestination(destination);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter(path) {
      return path === source || !excluded.has(path.split(/[\\/]/).at(-1));
    },
  });
  const report = await validatePagesStage(target);
  process.stdout.write(
    `Staged LAB 002 Pages app: ${target} (${report.files.length} files)\n`,
  );
  return report;
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const validateOnly = argumentsList[0] === "--validate-only";
  const destination = resolve(
    scriptDirectory,
    argumentsList[validateOnly ? 1 : 0] || "../../web/lab-002",
  );
  const report = validateOnly ?
    await validatePagesStage(destination) :
    await stagePages(destination);
  if (validateOnly) {
    process.stdout.write(
      `LAB 002 Pages staging: PASS (${report.files.length} files)\n`,
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
