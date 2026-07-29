import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("browser preset copy stays exactly synchronized with shared source", async () => {
  assert.deepEqual(
    JSON.parse(await read("web/shared/presets.json")),
    JSON.parse(await read("shared/presets.json")),
  );
});

test("worker performs exact full-resolution composition and transfers output", async () => {
  const source = await read("web/js/worker.js");
  assert.match(source, /blendComposite/);
  assert.match(source, /background\.width/);
  assert.match(source, /background\.height/);
  assert.match(source, /postMessage\([^;]+result\.data\.buffer/s);
  assert.doesNotMatch(source, /1200/);
});

test("renderer supports text, uploaded fonts, PNG alpha, fit, mesh, and overlays", async () => {
  const source = await read("web/js/renderer.js");
  assert.match(source, /new FontFace/);
  assert.match(source, /createTextCanvas/);
  assert.match(source, /fitMode/);
  assert.match(source, /drawAdaptiveTriangleMeshPreview/);
  assert.match(source, /drawGridOverlay/);
  assert.match(source, /drawVanishingOverlay/);
  assert.match(source, /premultiplyRgba/);
});

test("UI exposes upload, four-point, comparison, overlay, reset, and export contracts", async () => {
  const html = await read("web/index.html");
  [
    "background-input", "asset-input", "font-input", "text-input",
    "editor-canvas", "point-status", "geometry-error", "preset-select",
    "grid-toggle", "vanishing-toggle", "original-button", "compare-slider",
    "reset-button", "export-png", "export-jpeg", "mobile-warning",
    "blend-mode", "opacity", "blur", "brightness", "tint", "texture",
    "saturation", "fit-mode", "shadow", "shadow-x", "shadow-y",
    "shadow-blur", "shadow-opacity",
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`), id));
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /id="vanishing-toggle"[^>]*checked/);
  assert.match(html, /消影辅助/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
});

test("the first-load demo asset is packaged with the static web app", async () => {
  const background = await readFile(new URL("web/assets/examples/court.jpg", root));
  const overlay = await readFile(new URL("web/assets/examples/court-ad.png", root));
  assert.ok(background.byteLength > 10_000);
  assert.ok(overlay.byteLength > 10_000);
});

test("direct file opening gives an actionable local-server recovery path", async () => {
  const html = await read("web/index.html");
  const server = await read("scripts/serve_web.mjs");
  const launcher = await read("start-web.cmd");
  const readme = await read("README.md");
  assert.match(html, /id="protocol-warning"/);
  assert.match(html, /location\.protocol\s*===\s*["']file:["']/);
  assert.match(html, /start-web\.cmd/);
  assert.match(server, /--open/);
  assert.match(launcher, /serve_web\.mjs --open/);
  assert.match(readme, /不要直接双击\s*`web\/index\.html`/);
});

test("app uses capped preview, animation frames, worker final render, relative first-load asset", async () => {
  const source = await read("web/js/app.js");
  assert.match(source, /MAX_PREVIEW_SIZE\s*=\s*1200/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /new Worker\(new URL\("\.\/worker\.js", import\.meta\.url\)/);
  assert.match(source, /pointerup/);
  assert.match(source, /assets\/examples\/court\.jpg/);
  assert.match(source, /assets\/examples\/court-ad\.png/);
  assert.match(source, /applyPreset\(state,\s*"court",\s*presets\.court\)/);
  assert.match(source, /先贴得准，再融得真/);
  assert.match(source, /toBlob/);
});

test("UI exposes court and facade presets with court selected first", async () => {
  const html = await read("web/index.html");
  assert.match(html, /<option value="court"[^>]*selected>篮球场<\/option>/);
  assert.match(html, /<option value="facade">楼体 Logo<\/option>/);
});

test("canvas exposes keyboard editing and live status contracts", async () => {
  const html = await read("web/index.html");
  const source = await read("web/js/app.js");
  assert.match(html, /id="keyboard-instructions"/);
  assert.match(html, /id="keyboard-status"[^>]+aria-live="polite"/);
  assert.match(html, /aria-describedby="keyboard-instructions"/);
  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Delete", "Enter"]
    .forEach((key) => assert.match(source, new RegExp(key)));
  assert.match(source, /event\.code\s*===\s*"Space"/);
  assert.match(source, /event\.shiftKey\s*\?\s*10\s*:\s*1/);
});

test("mobile layout stacks below 960px and warns", async () => {
  const css = await read("web/style.css");
  assert.match(css, /@media\s*\(max-width:\s*959px\)/);
  assert.match(css, /#mobile-warning/);
});

test("Playwright owns a cross-platform static server with explicit in-process teardown", async () => {
  const config = await read("playwright.config.js");
  const server = await read("scripts/serve_web.mjs");
  const setup = await read("tests/e2e/global-setup.js");
  assert.match(config, /globalSetup:\s*["']\.\/tests\/e2e\/global-setup\.js["']/);
  assert.doesNotMatch(config, /webServer\s*:/);
  assert.doesNotMatch(config, /python -m http\.server/);
  assert.match(setup, /startStaticServer/);
  assert.match(setup, /closeStaticServer/);
  assert.match(config, /process\.env\.E2E_PORT/);
  assert.match(setup, /process\.env\.E2E_PORT/);
  assert.match(server, /SIGINT/);
  assert.match(server, /SIGTERM/);
  assert.match(server, /server\.close/);
});
