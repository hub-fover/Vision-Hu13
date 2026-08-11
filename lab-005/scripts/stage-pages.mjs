import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const labRoot = resolve(scriptDir, "..");
const source = resolve(labRoot, "web");
const defaultDestination = resolve(scriptDir, "../../web/lab-005");
const excluded = new Set(["node_modules", "package.json", "package-lock.json", ".gitignore", "README.md", "test-results"]);
const required = ["index.html", "styles.css", "js/app.js", "js/state.js", "js/worker-client.js", "js/defocus.worker.js", "assets/samples/manifest.json"];

async function files(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, path));
    if (entry.isFile()) result.push(relative(root, path).split(sep).join("/"));
  }
  return result.sort();
}

function safeDestination(destination) {
  const target = resolve(destination);
  const temporary = relative(resolve(tmpdir()), target);
  if (target !== defaultDestination && (temporary === "" || temporary.startsWith("..") || isAbsolute(temporary))) {
    throw new Error(`unsafe LAB 005 staging destination: ${target}`);
  }
  return target;
}

export async function validatePagesStage(destination = defaultDestination) {
  const root = resolve(destination);
  const missing = [];
  for (const path of required) {
    try {
      if (!(await stat(resolve(root, path))).isFile()) throw new Error();
    } catch {
      missing.push(path);
    }
  }
  if (missing.length) throw new Error(missing.map((path) => `missing staged asset: ${path}`).join("\n"));

  const manifest = JSON.parse(await readFile(resolve(root, "assets/samples/manifest.json"), "utf8"));
  if (manifest.schema !== "lab005.samples.v1" || !Array.isArray(manifest.frames) || manifest.frames.length !== 5) {
    throw new Error("sample manifest must expose exactly five frames using lab005.samples.v1");
  }
  for (const frame of manifest.frames) {
    if (!frame.path || !(await stat(resolve(root, "assets/samples", frame.path))).isFile()) {
      throw new Error(`missing sample frame: ${frame.path}`);
    }
  }

  const runtimeFiles = (await files(root)).filter((path) => path === "index.html" || path === "styles.css" || path.startsWith("js/"));
  for (const path of runtimeFiles) {
    const content = await readFile(resolve(root, path), "utf8");
    if (/https?:\/\//i.test(content)) throw new Error(`remote runtime reference in ${path}`);
    if (/(?:src|href)=["']\/(?!\/)/i.test(content)) throw new Error(`root-absolute resource in ${path}`);
    if (/(?:XMLHttpRequest|sendBeacon)\s*\(/i.test(content) || /fetch\(\s*[`"']https?:/i.test(content)) throw new Error(`network upload API in ${path}`);
    if (/(?:localStorage|sessionStorage|indexedDB|document\.cookie)/i.test(content)) throw new Error(`persistent storage in ${path}`);
  }
  const html = await readFile(resolve(root, "index.html"), "utf8");
  if (!/<meta[^>]+charset=["']?utf-8/i.test(html)) throw new Error("index.html must declare UTF-8");
  return { files: await files(root), sampleCount: manifest.frames.length };
}

export async function stagePages(destination = defaultDestination) {
  const target = safeDestination(destination);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, filter: (path) => path === source || !excluded.has(path.split(/[\\/]/).at(-1)) });
  return validatePagesStage(target);
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args[0] === "--validate-only";
  const destination = resolve(scriptDir, args[validateOnly ? 1 : 0] || "../../web/lab-005");
  const report = validateOnly ? await validatePagesStage(destination) : await stagePages(destination);
  process.stdout.write(`LAB 005 Pages: PASS (${report.files.length} files, ${report.sampleCount} samples)\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
