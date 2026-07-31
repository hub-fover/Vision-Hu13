import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const web = new URL("../../web/", import.meta.url);

test("Worker lazy-loads same-origin OpenCV and source has no persistence or telemetry APIs", async () => {
  const worker = await readFile(new URL("js/fusion.worker.js", web), "utf8");
  const app = await readFile(new URL("js/app.js", web), "utf8");
  const html = await readFile(new URL("index.html", web), "utf8");
  assert.match(worker, /importScripts\("\.\.\/vendor\/opencv\.js"\)/);
  assert.doesNotMatch(html, /<script[^>]+opencv\.js/i);
  const runtime = `${worker}\n${app}`;
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest/);
  assert.doesNotMatch(runtime, /fetch\s*\(/);
});

test("mobile capture, gallery, cancellation, result views, download and share are present", async () => {
  const html = await readFile(new URL("index.html", web), "utf8");
  assert.equal((html.match(/capture="environment"/g) ?? []).length, 3);
  for (const id of ["gallery-input", "sample-button", "run-button", "cancel-button", "download-button", "share-button"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const view of ["fusion", "middle", "motion"]) assert.match(html, new RegExp(`data-view="${view}"`));
});
