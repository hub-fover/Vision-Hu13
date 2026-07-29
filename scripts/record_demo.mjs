/**
 * Record a real interaction with the browser app, then derive MP4/GIF backups.
 *
 * Usage:
 *   node scripts/record_demo.mjs
 *   node scripts/record_demo.mjs --url http://127.0.0.1:4173
 */

import { createReadStream } from "node:fs";
import { access, copyFile, mkdtemp, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = join(ROOT, "web");
const DEMO_DIR = join(ROOT, "demo");
const VIDEO_SIZE = { width: 1080, height: 1350 };
const INTERNAL_PORT = 4174;
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const requestedUrl = urlIndex >= 0 ? args[urlIndex + 1] : null;
if (urlIndex >= 0 && !requestedUrl) {
  throw new Error("--url requires an address, for example http://127.0.0.1:4173");
}

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const requested = pathname === "/" ? "/index.html" : pathname;
      const file = resolve(WEB_ROOT, `.${requested}`);
      if (relative(WEB_ROOT, file).startsWith("..")) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(INTERNAL_PORT, "127.0.0.1", () => resolveServer(server));
  });
}

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function drag(page, from, to, duration = 650) {
  await page.mouse.move(from.x, from.y, { steps: 12 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: Math.max(18, Math.round(duration / 24)) });
  await page.mouse.up();
  await wait(180);
}

async function pointInCanvas(canvas, fx, fy) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is not visible");
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function record(baseUrl) {
  const videoScratch = await mkdtemp(join(tmpdir(), "vision-hub-playwright-"));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist")) throw error;
    // CI normally installs Playwright Chromium. Local contributors can use their
    // installed stable Chrome without downloading another browser.
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }
  const context = await browser.newContext({
    viewport: VIDEO_SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoScratch, size: VIDEO_SIZE },
  });
  const page = await context.newPage();
  const video = page.video();
  if (!video) throw new Error("Playwright video recording was not initialized");

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#editor-canvas").waitFor({ state: "visible" });
    await page.locator("#empty-message").waitFor({ state: "hidden", timeout: 15_000 });
    await wait(600);

    // Use the actual file inputs and app rendering pipeline.
    await page.locator("#background-input").setInputFiles(
      join(ROOT, "assets", "examples", "wall.jpg"));
    await page.locator("#asset-input").setInputFiles(
      join(ROOT, "assets", "examples", "lab-poster.png"));
    await page.locator("#editor-canvas").scrollIntoViewIfNeeded();
    await wait(700);

    const canvas = page.locator("#editor-canvas");
    const initialFractions = [
      [0.22, 0.10],
      [0.82, 0.10],
      [0.82, 0.58],
      [0.22, 0.58],
    ];
    for (const [fx, fy] of initialFractions) {
      const point = await pointInCanvas(canvas, fx, fy);
      await page.mouse.move(point.x, point.y, { steps: 18 });
      await page.mouse.down();
      await wait(120);
      await page.mouse.up();
      await wait(260);
    }
    await wait(650);

    await page.locator("#grid-toggle").check();
    await page.locator("#vanishing-toggle").check();
    await wait(450);

    // Drag all four real canvas handles into a readable perspective plane.
    const targetFractions = [
      [0.19, 0.08],
      [0.88, 0.08],
      [0.88, 0.61],
      [0.19, 0.60],
    ];
    for (let index = 0; index < initialFractions.length; index += 1) {
      const [fromX, fromY] = initialFractions[index];
      const [toX, toY] = targetFractions[index];
      await drag(
        page,
        await pointInCanvas(canvas, fromX, fromY),
        await pointInCanvas(canvas, toX, toY),
      );
      initialFractions[index] = targetFractions[index];
    }

    // Show that comparison and texture controls are live, not composited captions.
    await page.locator("#texture").evaluate((input) => {
      input.value = "0.55";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(500);
    for (const value of [85, 60, 35, 65, 100]) {
      await page.locator("#compare-slider").evaluate((input, next) => {
        input.value = String(next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
      await wait(220);
    }

    const original = page.locator("#original-button");
    const originalBox = await original.boundingBox();
    if (originalBox) {
      await page.mouse.move(originalBox.x + originalBox.width / 2, originalBox.y + originalBox.height / 2);
      await page.mouse.down();
      await wait(700);
      await page.mouse.up();
    }
    await canvas.scrollIntoViewIfNeeded();
    await wait(900);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const webmPath = join(DEMO_DIR, "demo.webm");
  const recordedPath = await video.path();
  await copyFile(recordedPath, webmPath);
  await access(webmPath);
  return webmPath;
}

function deriveBackups() {
  const venvPython = process.platform === "win32"
    ? join(ROOT, ".venv", "Scripts", "python.exe")
    : join(ROOT, ".venv", "bin", "python");
  const interpreter = process.env.PYTHON || venvPython;
  const result = spawnSync(
    interpreter,
    [join(ROOT, "scripts", "generate_demo.py"), "--from-webm"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Demo backup conversion failed with exit code ${result.status}`);
  }
}

let server = null;
try {
  const baseUrl = requestedUrl || `http://127.0.0.1:${INTERNAL_PORT}`;
  if (!requestedUrl) server = await startStaticServer();
  const webmPath = await record(baseUrl);
  deriveBackups();
  console.log(`Recorded the real app to ${relative(ROOT, webmPath)} and derived MP4/GIF backups.`);
} finally {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
